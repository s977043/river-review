import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAllArtifacts } from '../src/config/artifact-resolver.mjs';
import {
  DEFAULT_FLOW_INPUT_BINDINGS,
  ENTRY_FLOW_INPUT_BINDING_OVERRIDES,
  resolveFlowInputBindings,
} from '../src/lib/flow-input-bindings.mjs';

const document = {
  inputs: [{ name: 'requirements' }, { name: 'tasks' }, { name: 'tests' }, { name: 'plan' }],
};

const resolution = (id, source = 'cwd') => ({
  id,
  path: `/repo/${id}`,
  source,
  exists: true,
});

describe('Flow input bindings', () => {
  // Three supply routes compete for one Flow input name. Only the CLI-vs-default
  // pair was pinned, so a mutation that ignored every non-CLI direct hit stayed
  // green. Pin the full order: explicit CLI > same-named resolution from any
  // other source > role-wide default binding.
  test('supply order: explicit CLI beats a same-named resolution, which beats the default', () => {
    // `tests` is the only role with a default binding, so it is the one role
    // where all three supply routes can compete.
    const cliWins = resolveFlowInputBindings({
      document,
      resolved: { tests: resolution('tests', 'cli'), junit: resolution('junit') },
    });
    assert.equal(cliWins.inputs.tests, '/repo/tests');
    assert.equal(cliWins.inputSources.tests.kind, 'explicit');

    // The mutation this pins: dropping non-CLI direct hits would fall through
    // to `junit` here, silently changing which file the Flow reads.
    const directWins = resolveFlowInputBindings({
      document,
      resolved: { tests: resolution('tests', 'config'), junit: resolution('junit') },
    });
    assert.equal(directWins.inputs.tests, '/repo/tests');
    assert.equal(directWins.inputSources.tests.kind, 'direct');
    assert.equal(directWins.inputSources.tests.source, 'config');

    const defaultWins = resolveFlowInputBindings({
      document,
      resolved: { junit: resolution('junit') },
    });
    assert.equal(defaultWins.inputs.tests, '/repo/junit');
    assert.equal(defaultWins.inputSources.tests.kind, 'default');
    assert.equal(defaultWins.inputSources.tests.id, 'junit');
  });

  test('an explicit artifact that does not exist is not overridden by a default', () => {
    // `--artifact tests=missing.xml` supplies no path, so guarding the default
    // pass on `inputs` let `junit` take over: the documented order broke and
    // the bound-artifact-missing reason disappeared.
    const { inputs, inputSources } = resolveFlowInputBindings({
      document,
      resolved: {
        tests: { id: 'tests', path: '/repo/missing.xml', source: 'cli', exists: false },
        junit: resolution('junit'),
      },
    });
    assert.equal(inputs.tests, undefined);
    assert.equal(inputSources.tests.kind, 'explicit');
    assert.equal(inputSources.tests.id, 'tests');
    assert.equal(inputSources.tests.path, '/repo/missing.xml');
  });

  test('declares the role-wide defaults and no entry-specific exceptions yet', () => {
    // `requirements` and `tasks` are deliberately absent: both are REQUIRED on
    // some Flows, so a default there would let a file that merely happens to
    // sit in the working tree declare a required input satisfied.
    assert.deepEqual(DEFAULT_FLOW_INPUT_BINDINGS, {
      tests: ['junit', 'coverage', 'test-cases'],
    });
    assert.deepEqual(ENTRY_FLOW_INPUT_BINDING_OVERRIDES, {});
  });

  test('required roles get no default binding: pbi-input and todo are ignored', () => {
    // `tasks` is required on task-completion-review and `requirements` on
    // final-review / requirements-review. A working tree that happens to hold
    // `todo.md` or `pbi-input.md` must not satisfy them.
    const { inputs, inputSources, unboundInputNames } = resolveFlowInputBindings({
      document,
      resolved: {
        'pbi-input': resolution('pbi-input'),
        todo: resolution('todo'),
      },
    });
    assert.equal(inputs.requirements, undefined);
    assert.equal(inputs.tasks, undefined);
    assert.equal(inputSources.requirements, undefined);
    assert.equal(inputSources.tasks, undefined);
    assert.deepEqual(unboundInputNames, ['plan', 'requirements', 'tasks']);
  });

  test('an explicitly supplied required role is still honoured', () => {
    const { inputs, inputSources } = resolveFlowInputBindings({
      document,
      resolved: { tasks: resolution('tasks', 'cli') },
    });
    assert.equal(inputs.tasks, '/repo/tasks');
    assert.equal(inputSources.tasks.kind, 'explicit');
  });

  test('uses the first available tests candidate in declared order', () => {
    const result = resolveFlowInputBindings({
      document,
      resolved: {
        junit: resolution('junit'),
        coverage: resolution('coverage'),
        'test-cases': resolution('test-cases'),
      },
    });
    assert.equal(result.inputs.tests, '/repo/junit');
    assert.deepEqual(result.inputSources.tests, { kind: 'default', id: 'junit', source: 'cwd' });
  });

  test('uses a later available candidate instead of treating an earlier default filename as missing', () => {
    const result = resolveFlowInputBindings({
      document,
      resolved: { coverage: resolution('coverage') },
    });
    assert.equal(result.inputs.tests, '/repo/coverage');
    assert.deepEqual(result.inputSources.tests, { kind: 'default', id: 'coverage', source: 'cwd' });
  });

  test('an explicit same-named CLI artifact wins over the default binding', () => {
    const result = resolveFlowInputBindings({
      document,
      resolved: { tasks: resolution('tasks', 'cli'), todo: resolution('todo') },
    });
    assert.equal(result.inputs.tasks, '/repo/tasks');
    assert.deepEqual(result.inputSources.tasks, { kind: 'explicit', id: 'tasks', source: 'cli' });
  });

  test('reports a missing default target as bound while leaving a role without a table entry unbound', () => {
    const result = resolveFlowInputBindings({
      document: { inputs: [{ name: 'design' }, { name: 'tests' }] },
      resolved: {
        todo: resolution('todo'),
        'pbi-input': { exists: false, path: '/repo/pbi-input' },
      },
    });
    assert.deepEqual(result, {
      inputs: {},
      inputSources: {
        tests: { kind: 'default', id: 'junit', source: null, path: 'junit.xml' },
      },
      unboundInputNames: ['design'],
    });
  });

  test('keeps an explicit missing path as a binding so callers can tell it from no binding', () => {
    const result = resolveFlowInputBindings({
      document: { inputs: [{ name: 'tasks' }] },
      resolved: { tasks: { exists: false, path: '/repo/missing-tasks.md', source: 'cli' } },
    });
    assert.deepEqual(result, {
      inputs: {},
      inputSources: {
        tasks: { kind: 'explicit', id: 'tasks', source: 'cli', path: '/repo/missing-tasks.md' },
      },
      unboundInputNames: [],
    });
  });
  // #2011 AC7 P3-4. Cross-checks the real production path rather than this
  // module alone: the Flow document on disk, the artifact resolver, and the
  // same-named binding must line up.
  //
  // `design` is bound by the same-named rule (flow-input-bindings.mjs:73-83),
  // so it must NOT appear in DEFAULT_FLOW_INPUT_BINDINGS -- a role default
  // there would be redundant. It must also have NO cwd default, because it is
  // REQUIRED on design-review / technical-review and
  // runner-cli-reference.md § "--entry の受理範囲" declares that required
  // inputs carry no default binding. Both halves are pinned below: explicit
  // supply binds, and a design.md sitting in cwd does not.
  describe('design (#2011 AC7 P3-4)', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const designFlow = JSON.parse(
      readFileSync(resolvePath(__dirname, '../flows/design-review.flow.json'), 'utf8')
    );

    const fsWith = (existing) => ({
      access(candidate) {
        return existing.includes(candidate)
          ? Promise.resolve()
          : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      },
    });

    test('design-review declares design as REQUIRED and no role default exists', () => {
      assert.equal(
        designFlow.inputs.find((input) => input.name === 'design')?.required,
        true,
        'design-review must keep design REQUIRED for these tests to mean anything'
      );
      assert.equal(DEFAULT_FLOW_INPUT_BINDINGS.design, undefined);
    });

    test('an explicitly supplied design binds to the Flow input', async () => {
      const resolved = await resolveAllArtifacts({
        cwd: '/repo',
        cliArgs: { design: 'docs/design.md' },
        fsImpl: fsWith(['/repo/docs/design.md']),
      });
      assert.equal(resolved.design.path, '/repo/docs/design.md');
      assert.equal(resolved.design.source, 'cli');

      const result = resolveFlowInputBindings({
        entry: 'design-review',
        document: designFlow,
        resolved,
      });
      assert.equal(result.inputs.design, '/repo/docs/design.md');
      assert.deepEqual(result.inputSources.design, {
        kind: 'explicit',
        id: 'design',
        source: 'cli',
      });
      assert.ok(!result.unboundInputNames.includes('design'));
    });

    // The mutation this pins: restoring `design: 'design.md'` to CWD_DEFAULTS
    // would bind the REQUIRED input from a file nobody named, and this test is
    // the only thing that would notice.
    test('a design.md sitting in cwd does not bind the required design input', async () => {
      const resolved = await resolveAllArtifacts({
        cwd: '/repo',
        fsImpl: fsWith(['/repo/design.md']),
      });
      assert.equal(resolved.design, undefined, 'design must not be a cwd-probed artifact ID');

      const result = resolveFlowInputBindings({
        entry: 'design-review',
        document: designFlow,
        resolved,
      });
      assert.equal(result.inputs.design, undefined);
      assert.equal(result.inputSources.design, undefined);
      assert.ok(result.unboundInputNames.includes('design'));
    });
  });
});
