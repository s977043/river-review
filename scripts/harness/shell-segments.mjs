// Bash の command 文字列を、トップレベルの区切り（`;` `&&` `||` `|` `&` 改行）で
// segment へ分け、先頭のコマンド語を取り出す。
//
// .claude/hooks/no-force-push.sh の sanitizer（heredoc 本体の除去・行継続の結合・
// クォート内を区切りとして扱わない）と同じ規則を JS へ移したもの。hook 側は awk で
// 書かれており import できないため、harness 側の実装はこのモジュール 1 つに限る。
// 規則の定義は docs/development/agent-harness-design.md の「signal の定義」を参照。

const HEREDOC_RE = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()]+))/;
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * heredoc の開始位置から区切り語を読む。`<<<`（here-string）は heredoc ではない。
 *
 * @param {string} text
 * @param {number} i `<<` の位置
 * @returns {{ delimiter: string, length: number } | null}
 */
function readHeredocStart(text, i) {
  if (text[i + 2] === '<') return null;
  const match = HEREDOC_RE.exec(text.slice(i));
  if (!match) return null;
  const delimiter = (match[2] ?? match[3] ?? match[4]).replace(/\\/g, '');
  return delimiter === '' ? null : { delimiter, length: match[0].length };
}

/**
 * 改行の直後から、保留中の heredoc 本体を読み飛ばした位置を返す。
 *
 * @param {string} text
 * @param {number} start 本体 1 行目の先頭
 * @param {string[]} delimiters
 * @returns {number}
 */
function skipHeredocBodies(text, start, delimiters) {
  let pos = start;
  for (const delimiter of delimiters) {
    while (pos < text.length) {
      const end = text.indexOf('\n', pos);
      const line = end < 0 ? text.slice(pos) : text.slice(pos, end);
      pos = end < 0 ? text.length : end + 1;
      if (line.trim() === delimiter) break;
    }
  }
  return pos;
}

/**
 * command 文字列をトップレベルの segment へ分ける。
 *
 * クォート・`$(...)`・バッククォートの内側と heredoc 本体は区切りとして扱わない。
 * `\` + 改行（行継続）は空白に置き換える。空の segment は返さない。
 *
 * @param {unknown} command
 * @returns {string[]}
 */
export function splitShellSegments(command) {
  const text = String(command ?? '');
  const segments = [];
  let current = '';
  let quote = null; // "'" | '"' | '`'
  let depth = 0; // $( ... ) の入れ子
  let pendingHeredocs = [];

  const flush = () => {
    if (current.trim() !== '') segments.push(current.trim());
    current = '';
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (quote === "'") {
      current += c;
      if (c === "'") quote = null;
      i += 1;
      continue;
    }
    if (c === '\\') {
      if (text[i + 1] === '\n') {
        current += ' ';
      } else {
        current += text.slice(i, i + 2);
      }
      i += 2;
      continue;
    }
    if (quote === '"' || quote === '`') {
      current += c;
      if (c === quote) quote = null;
      i += 1;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      current += c;
      i += 1;
      continue;
    }
    if (c === '$' && text[i + 1] === '(') {
      depth += 1;
      current += '$(';
      i += 2;
      continue;
    }
    if (depth > 0) {
      if (c === ')') depth -= 1;
      if (c === '(') depth += 1;
      current += c;
      i += 1;
      continue;
    }
    if (c === '#' && (current === '' || /\s$/.test(current))) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === '<' && text[i + 1] === '<') {
      const heredoc = readHeredocStart(text, i);
      if (heredoc) {
        pendingHeredocs.push(heredoc.delimiter);
        current += text.slice(i, i + heredoc.length);
        i += heredoc.length;
        continue;
      }
    }
    if (c === '\n') {
      flush();
      i = skipHeredocBodies(text, i + 1, pendingHeredocs);
      pendingHeredocs = [];
      continue;
    }
    if (c === ';' || c === '|' || c === '&') {
      // `>&2` / `2>&1` / `&>` はリダイレクトであり区切りではない
      if (c === '&' && (/[<>]$/.test(current) || text[i + 1] === '>')) {
        current += c;
        i += 1;
        continue;
      }
      flush();
      i += c !== ';' && text[i + 1] === c ? 2 : 1;
      continue;
    }
    current += c;
    i += 1;
  }
  flush();
  return segments;
}

/**
 * segment を単語へ分け、クォートを外して返す（変数展開はしない）。
 *
 * @param {string} segment
 * @returns {string[]}
 */
function splitWords(segment) {
  const words = [];
  let word = '';
  let quote = null;
  let started = false;
  let depth = 0;
  for (let i = 0; i < segment.length; i += 1) {
    const c = segment[i];
    if (depth > 0) {
      if (c === '(') depth += 1;
      if (c === ')') depth -= 1;
      word += c;
      continue;
    }
    if (c === '$' && segment[i + 1] === '(' && !quote) {
      depth = 1;
      word += '$(';
      started = true;
      i += 1;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      started = true;
      continue;
    }
    if (c === '\\' && i + 1 < segment.length) {
      word += segment[i + 1];
      started = true;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      if (started) words.push(word);
      word = '';
      started = false;
      continue;
    }
    word += c;
    started = true;
  }
  if (started) words.push(word);
  return words;
}

/**
 * segment のコマンド語を返す。先頭の `(` `{` と環境変数の代入（`FOO=bar`）は読み飛ばす。
 * 代入だけの segment（`R=/path`）はコマンド語を持たないので null。
 *
 * @param {string} segment
 * @returns {string | null}
 */
export function commandWordOf(segment) {
  const words = splitWords(String(segment ?? '').replace(/^[\s({]+/, ''));
  for (const word of words) {
    if (ASSIGNMENT_RE.test(word)) continue;
    return word;
  }
  return null;
}

/**
 * command 文字列の最初のコマンド語。代入だけの segment は飛ばして次の segment を見る。
 *
 * @param {unknown} command
 * @returns {string | null}
 */
export function firstCommandWord(command) {
  for (const segment of splitShellSegments(command)) {
    const word = commandWordOf(segment);
    if (word !== null) return word;
  }
  return null;
}
