// `river runs` subcommand handler.
//
// Extracted verbatim from src/cli.mjs main() as part of the CLI dispatch
// refactor (split main() into per-subcommand handlers). Behavior, messages,
// and exit codes are unchanged; only the enclosing function and the relative
// import depth differ from the original inline block.
import { deriveLoopSignalFromRunsDiff } from '../../lib/loop-signal.mjs';

/**
 * Handle the `runs` command (list | diff | summary | digest).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runRunsCommand(parsed, targetPath) {
  const { resolveStoreDir, listRunRecords, loadRunRecord, computeDashboard, formatDashboard } =
    await import('../../lib/result-store.mjs');
  const storeDir = resolveStoreDir(targetPath);

  if (!parsed.runsSubcommand || parsed.runsSubcommand === 'list') {
    const runs = await listRunRecords(storeDir);
    if (!runs.length) {
      console.log('No stored runs found in ' + storeDir);
      return 0;
    }
    console.log(`Stored runs (${storeDir}):\n`);
    for (const r of runs) {
      console.log(
        // #1857 / ADR-007: `overflow=` is printed next to `suppressed=` so the
        // two events the pre-split records summed into one number stay
        // distinguishable on screen.
        `  ${r.runId}  phase=${r.phase}  findings=${r.findingsCount}  suppressed=${r.suppressedCount}  overflow=${r.overflowCount}  files=${r.changedFilesCount}  ${r.timestamp}`
      );
    }
    return 0;
  }

  if (parsed.runsSubcommand === 'diff') {
    if (!parsed.runsId1 || !parsed.runsId2) {
      console.error('Error: river runs diff <id1> <id2> [<id3>...]');
      return 1;
    }
    const { diffReviews, diffRunHistory, formatRegressionSummary } =
      await import('../../lib/review-differ.mjs');

    if (parsed.runsIds.length >= 3) {
      // Multi-run path: load all runs and detect oscillation
      const runRecords = await Promise.all(parsed.runsIds.map((id) => loadRunRecord(storeDir, id)));
      const diff = diffRunHistory(runRecords);
      // Sort by timestamp to find the latest run (same order as diffRunHistory).
      const sortedRecords = [...runRecords].sort((a, b) => {
        const ta = a.timestamp != null ? new Date(a.timestamp).getTime() : NaN;
        const tb = b.timestamp != null ? new Date(b.timestamp).getTime() : NaN;
        if (Number.isNaN(ta) && Number.isNaN(tb))
          return (a.runId ?? '').localeCompare(b.runId ?? '');
        if (Number.isNaN(ta)) return 1;
        if (Number.isNaN(tb)) return -1;
        return ta !== tb ? ta - tb : (a.runId ?? '').localeCompare(b.runId ?? '');
      });
      const latestRunArtifact = sortedRecords[sortedRecords.length - 1];
      const runsSignal = deriveLoopSignalFromRunsDiff(diff, latestRunArtifact);
      if (parsed.output === 'json') {
        const diffWithSignal = { ...diff, suggestedLoopSignal: runsSignal };
        console.log(JSON.stringify(diffWithSignal, null, 2));
      } else if (parsed.output === 'html') {
        const { formatLoopDashboardHtml } = await import('../../lib/output-formatters/html.mjs');
        console.log(
          formatLoopDashboardHtml(diff, {
            runIds: sortedRecords.map((r) => r.runId),
            suggestedLoopSignal: runsSignal,
          })
        );
      } else {
        console.log(formatRegressionSummary(diff));
        if (diff.oscillated.length) {
          console.log('\n### Oscillating findings (' + diff.oscillated.length + ')');
          for (const o of diff.oscillated) {
            const f = o.finding ?? {};
            const file = f.file ?? '?';
            const title = (f.title || f.message || '').slice(0, 80);
            const timelineStr = o.timeline
              .map((t) => `${t.runId.slice(0, 8)}:${t.present ? 'present' : 'absent'}`)
              .join(' → ');
            console.log(`- \`${o.fingerprint}\` \`${file}\`: ${title}`);
            console.log(`  timeline: ${timelineStr}`);
          }
        } else {
          console.log('\nNo oscillating findings detected.');
        }
      }
    } else {
      // 2-run path: existing behaviour, byte-compatible
      const [run1, run2] = await Promise.all([
        loadRunRecord(storeDir, parsed.runsId1),
        loadRunRecord(storeDir, parsed.runsId2),
      ]);
      const diff = diffReviews(run1.findings ?? [], run2.findings ?? [], {
        // run2 is the current side: its coverage qualifies the absences (#2325).
        currentCoverage: run2.reviewCoverage ?? null,
      });
      const runsSignal = deriveLoopSignalFromRunsDiff(diff, run2);
      if (parsed.output === 'json') {
        const diffWithSignal = { ...diff, suggestedLoopSignal: runsSignal };
        console.log(JSON.stringify(diffWithSignal, null, 2));
      } else if (parsed.output === 'html') {
        const { formatLoopDashboardHtml } = await import('../../lib/output-formatters/html.mjs');
        console.log(
          formatLoopDashboardHtml(diff, {
            runIds: [run1.runId, run2.runId].filter(Boolean),
            suggestedLoopSignal: runsSignal,
          })
        );
      } else {
        console.log(formatRegressionSummary(diff));
      }
    }
    return 0;
  }

  if (parsed.runsSubcommand === 'summary') {
    const runs = await listRunRecords(storeDir);
    if (!runs.length) {
      console.log('No stored runs found in ' + storeDir);
      return 0;
    }
    // Load full records for dashboard computation
    const fullRuns = await Promise.all(
      runs.map((r) => loadRunRecord(storeDir, r.runId).catch(() => null))
    );
    const valid = fullRuns.filter(Boolean);
    const db = computeDashboard(valid);
    console.log(formatDashboard(db));
    return 0;
  }

  if (parsed.runsSubcommand === 'digest') {
    const { loadAllRunRecords } = await import('../../lib/result-store.mjs');
    const fullRuns = await loadAllRunRecords(storeDir);
    if (!fullRuns.length) {
      console.log('No stored runs found in ' + storeDir);
      return 0;
    }
    const { buildRunsDigest, formatDigestMarkdown } = await import('../../lib/runs-digest.mjs');
    const digest = buildRunsDigest(fullRuns, { now: () => new Date() });
    if (parsed.output === 'json') {
      console.log(JSON.stringify(digest, null, 2));
    } else {
      console.log(formatDigestMarkdown(digest));
    }
    return 0;
  }

  console.error(
    `Unknown runs subcommand: ${parsed.runsSubcommand}. Use: list | diff | summary | digest`
  );
  return 1;
}
