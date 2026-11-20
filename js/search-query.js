/**
 * Turns a FurAffinity-style search into an SQLite FTS5 query for the subdata_fts index.
 *
 * Extended syntax (as on FA's search page):
 *   fender rednef / fender & rednef   both words
 *   fender | rednef                   either word
 *   rednef -fender / rednef !fender   without a word
 *   fox & (box | socks)               grouping
 *   "quick brown fox"                 phrase
 *   "quick brown fox"~3               words near each other
 *   "red_fox gray_fox fennec"/2       at least 2 of the words
 *   quick << brown << fox             ordering (treated as "all of these")
 *   @title @message @keywords @lower  limit following words to a field, @(title,keywords) for several
 */

/** FA field name -> subdata_fts column */
export const SEARCH_FIELDS = {
  title: 'title',
  message: 'desc',
  keywords: 'tags',
  lower: 'username',
};

const MAX_QUORUM_COMBINATIONS = 200;

function tokenize(text) {
  const tokens = [];
  let i = 0;
  const s = String(text);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')' || c === '|' || c === '&') { tokens.push({ t: c }); i++; continue; }
    if (s.startsWith('<<', i)) { tokens.push({ t: '&' }); i += 2; continue; }
    if ((c === '-' || c === '!') && i + 1 < s.length && !/\s/.test(s[i + 1])) { tokens.push({ t: 'not' }); i++; continue; }
    if (c === '"') {
      const end = s.indexOf('"', i + 1);
      const body = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      const mod = /^([~/])(\d+)/.exec(s.slice(i));
      if (mod) i += mod[0].length;
      tokens.push({ t: 'phrase', words: words(body), near: mod?.[1] === '~' ? +mod[2] : null, quorum: mod?.[1] === '/' ? +mod[2] : null });
      continue;
    }
    if (c === '@') {
      const list = /^@\(([^)]*)\)/.exec(s.slice(i)) || /^@(\w+)/.exec(s.slice(i));
      if (list) {
        tokens.push({ t: 'field', fields: list[1].split(/[\s,]+/).map(f => SEARCH_FIELDS[f.toLowerCase()]).filter(Boolean) });
        i += list[0].length;
        continue;
      }
      i++;
      continue;
    }
    const m = /^[^\s()|&"@]+/.exec(s.slice(i));
    tokens.push({ t: 'word', text: m[0] });
    i += m[0].length;
  }
  return tokens;
}

/** Splits text into the words the FTS tokenizer would index (letters, digits and underscores). */
function words(text) {
  return String(text).split(/[^\p{L}\p{N}_*]+/u).filter(w => w && w !== '*');
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];

  function group(inherited) {
    let fields = inherited;
    const alternatives = [];
    let current = [];
    while (pos < tokens.length && peek().t !== ')') {
      const tok = tokens[pos++];
      if (tok.t === '|') {
        alternatives.push(current);
        current = [];
      } else if (tok.t === '&') {
        continue;
      } else if (tok.t === 'field') {
        fields = tok.fields.length ? tok.fields : inherited;
      } else {
        let neg = false;
        let next = tok;
        while (next?.t === 'not') { neg = !neg; next = tokens[pos++]; }
        const node = primary(next, fields);
        if (node) current.push({ node, neg });
      }
    }
    alternatives.push(current);
    const ands = alternatives.filter(a => a.length).map(items => ({ t: 'and', items }));
    if (!ands.length) return null;
    return ands.length === 1 ? ands[0] : { t: 'or', items: ands };
  }

  function primary(tok, fields) {
    if (!tok) return null;
    if (tok.t === '(') {
      const node = group(fields);
      if (peek()?.t === ')') pos++;
      return node;
    }
    if (tok.t === 'word') {
      const prefix = tok.text.endsWith('*') || !fields;
      const parts = words(tok.text);
      if (!parts.length) return null;
      return { t: 'phrase', words: parts, fields, prefix };
    }
    if (tok.t === 'phrase') {
      if (!tok.words.length) return null;
      return { t: 'phrase', words: tok.words, fields, near: tok.near, quorum: tok.quorum };
    }
    return null;
  }

  return group(null);
}

const quote = w => `"${w.replace(/"/g, '""')}"`;
const scope = (fields, expr) => fields?.length ? `{${fields.join(' ')}} : ${expr}` : expr;

function combinations(list, k) {
  const out = [];
  const pick = (start, chosen) => {
    if (out.length > MAX_QUORUM_COMBINATIONS) return;
    if (chosen.length === k) { out.push(chosen); return; }
    for (let i = start; i < list.length; i++) pick(i + 1, [...chosen, list[i]]);
  };
  pick(0, []);
  return out;
}

function compilePhrase(node) {
  const { words: list, fields, near, quorum, prefix } = node;
  if (quorum != null) {
    const k = Math.max(1, Math.min(quorum, list.length));
    const terms = list.map(w => scope(fields, quote(w)));
    if (k === 1) return `(${terms.join(' OR ')})`;
    if (k === list.length) return `(${terms.join(' AND ')})`;
    const combos = combinations(terms, k);
    if (combos.length > MAX_QUORUM_COMBINATIONS) return `(${terms.join(' OR ')})`;
    return `(${combos.map(c => `(${c.join(' AND ')})`).join(' OR ')})`;
  }
  if (near != null && list.length > 1) return scope(fields, `NEAR(${list.map(quote).join(' ')}, ${near})`);
  const text = quote(list.join(' ').replace(/\*/g, ''));
  return scope(fields, prefix ? `${text}*` : text);
}

/** Returns { pos, neg }: what must match, and what must not (only when nothing positive is given). */
function compile(node) {
  if (!node) return { pos: null, neg: null };
  if (node.t === 'phrase') return { pos: compilePhrase(node), neg: null };
  if (node.t === 'or') {
    const parts = node.items.map(n => compile(n).pos).filter(Boolean);
    if (!parts.length) return { pos: null, neg: null };
    return { pos: parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`, neg: null };
  }
  const pos = [];
  const neg = [];
  for (const { node: child, neg: isNeg } of node.items) {
    const compiled = compile(child).pos;
    if (compiled) (isNeg ? neg : pos).push(compiled);
  }
  const negExpr = neg.length ? (neg.length === 1 ? neg[0] : `(${neg.join(' OR ')})`) : null;
  if (!pos.length) return { pos: null, neg: negExpr };
  const posExpr = pos.length === 1 ? pos[0] : `(${pos.join(' AND ')})`;
  return { pos: negExpr ? `(${posExpr} NOT ${negExpr})` : posExpr, neg: null };
}

/**
 * @param {String} text What was typed in the search box
 * @param {'all'|'any'|'extended'} mode FA's match criteria
 * @returns {{ match: String|null, exclude: String|null }|null} FTS5 expressions: rows must match `match`
 *   (when given) and must not match `exclude` (when given). null when there is nothing to search for.
 */
export function buildSearch(text, mode = 'extended') {
  if (!text || !String(text).trim()) return null;
  let tree;
  if (mode === 'all' || mode === 'any') {
    const items = words(text).map(w => ({ node: { t: 'phrase', words: [w], fields: null, prefix: true }, neg: false }));
    tree = !items.length ? null : mode === 'all' ? { t: 'and', items } : { t: 'or', items: items.map(i => i.node) };
  } else {
    tree = parse(tokenize(text));
  }
  const { pos, neg } = compile(tree);
  if (!pos && !neg) return null;
  return { match: pos, exclude: pos ? null : neg };
}
