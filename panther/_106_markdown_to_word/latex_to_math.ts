// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  DocxMath,
  MathFraction,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
} from "./deps.ts";

const GREEK_LETTERS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const FUNCTIONS: Record<string, string> = {
  min: "min",
  max: "max",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  cot: "cot",
  sec: "sec",
  csc: "csc",
  arcsin: "arcsin",
  arccos: "arccos",
  arctan: "arctan",
  sinh: "sinh",
  cosh: "cosh",
  tanh: "tanh",
  log: "log",
  ln: "ln",
  exp: "exp",
  lim: "lim",
  sup: "sup",
  inf: "inf",
  det: "det",
  dim: "dim",
  ker: "ker",
  hom: "hom",
  arg: "arg",
  deg: "deg",
  gcd: "gcd",
  Pr: "Pr",
};

const SYMBOLS: Record<string, string> = {
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  bullet: "•",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  propto: "∝",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  sqrt: "√",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  supset: "⊃",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  ldots: "…",
  cdots: "⋯",
  vdots: "⋮",
  ddots: "⋱",
  quad: " ",
  qquad: "  ",
  ",": " ",
  ";": " ",
  "!": "",
  "{": "{",
  "}": "}",
  "%": "%",
  "&": "&",
  "#": "#",
  _: "_",
  $: "$",
  backslash: "\\",
};

// Commands that take arguments and are handled specially
const SPECIAL_COMMANDS = new Set(["frac", "sqrt"]);

// Commands that are silently ignored (formatting hints)
const IGNORED_COMMANDS = new Set([
  "left",
  "right",
  "big",
  "Big",
  "bigg",
  "Bigg",
  "displaystyle",
  "textstyle",
  "scriptstyle",
  "scriptscriptstyle",
  "mathrm",
  "mathbf",
  "mathit",
  "mathsf",
  "mathtt",
  "mathcal",
  "mathbb",
  "text",
  "operatorname",
]);

export class UnsupportedLatexError extends Error {
  constructor(command: string, latex: string) {
    super(`Unsupported LaTeX command '\\${command}' in: ${latex}`);
    this.name = "UnsupportedLatexError";
  }
}

type MathNode =
  | { type: "text"; value: string }
  | { type: "group"; children: MathNode[] }
  | { type: "superscript"; base: MathNode; script: MathNode }
  | { type: "subscript"; base: MathNode; script: MathNode }
  | { type: "subsuperscript"; base: MathNode; sub: MathNode; sup: MathNode }
  | { type: "fraction"; numerator: MathNode; denominator: MathNode };

function tokenize(latex: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < latex.length) {
    const char = latex[i];

    if (char === "\\") {
      let cmd = "\\";
      i++;
      while (i < latex.length && /[a-zA-Z]/.test(latex[i])) {
        cmd += latex[i];
        i++;
      }
      if (cmd === "\\") {
        if (i < latex.length) {
          cmd += latex[i];
          i++;
        }
      }
      tokens.push(cmd);
    } else if (char === "{" || char === "}" || char === "^" || char === "_") {
      tokens.push(char);
      i++;
    } else if (/\s/.test(char)) {
      i++;
    } else {
      tokens.push(char);
      i++;
    }
  }

  return tokens;
}

function parseGroup(
  tokens: string[],
  start: number,
  originalLatex: string,
): { node: MathNode; end: number } {
  const children: MathNode[] = [];
  let i = start;

  if (tokens[i] === "{") {
    i++;
    while (i < tokens.length && tokens[i] !== "}") {
      const { node, end } = parseExpr(tokens, i, originalLatex);
      children.push(node);
      i = end;
    }
    i++; // skip }
    return {
      node: children.length === 1 ? children[0] : { type: "group", children },
      end: i,
    };
  }

  // Single token
  const { node, end } = parseExpr(tokens, i, originalLatex);
  return { node, end };
}

function parseExpr(
  tokens: string[],
  start: number,
  originalLatex: string,
): { node: MathNode; end: number } {
  let i = start;
  if (i >= tokens.length) {
    return { node: { type: "text", value: "" }, end: i };
  }

  const token = tokens[i];

  // Handle \frac{...}{...}
  if (token === "\\frac") {
    i++;
    const { node: num, end: numEnd } = parseGroup(tokens, i, originalLatex);
    const { node: den, end: denEnd } = parseGroup(
      tokens,
      numEnd,
      originalLatex,
    );
    let baseNode: MathNode = {
      type: "fraction",
      numerator: num,
      denominator: den,
    };
    i = denEnd;

    // Check for superscript/subscript after fraction
    while (i < tokens.length && (tokens[i] === "^" || tokens[i] === "_")) {
      if (tokens[i] === "^") {
        i++;
        const { node: script, end } = parseGroup(tokens, i, originalLatex);
        baseNode = { type: "superscript", base: baseNode, script };
        i = end;
      } else if (tokens[i] === "_") {
        i++;
        const { node: script, end } = parseGroup(tokens, i, originalLatex);
        baseNode = { type: "subscript", base: baseNode, script };
        i = end;
      }
    }

    return { node: baseNode, end: i };
  }

  // Handle \sqrt{...}
  if (token === "\\sqrt") {
    i++;
    const { node: content, end } = parseGroup(tokens, i, originalLatex);
    const text = "√(" + nodeToText(content) + ")";
    return { node: { type: "text", value: text }, end };
  }

  // Handle groups
  if (token === "{") {
    return parseGroup(tokens, i, originalLatex);
  }

  // Handle commands
  if (token.startsWith("\\")) {
    const cmd = token.slice(1);
    i++;

    // Check if command is supported
    if (GREEK_LETTERS[cmd]) {
      // Greek letter - supported
    } else if (SYMBOLS[cmd]) {
      // Symbol - supported
    } else if (FUNCTIONS[cmd]) {
      // Function name - supported
    } else if (IGNORED_COMMANDS.has(cmd)) {
      // Ignored formatting command - skip and continue
      // If next token is a group, parse it and return its contents
      if (i < tokens.length && tokens[i] === "{") {
        return parseGroup(tokens, i, originalLatex);
      }
      // Otherwise return empty and continue
      return { node: { type: "text", value: "" }, end: i };
    } else if (SPECIAL_COMMANDS.has(cmd)) {
      // This shouldn't happen as frac/sqrt are handled above
      throw new UnsupportedLatexError(cmd, originalLatex);
    } else {
      // Unknown command - throw error
      throw new UnsupportedLatexError(cmd, originalLatex);
    }

    const value = GREEK_LETTERS[cmd] ?? SYMBOLS[cmd] ?? FUNCTIONS[cmd] ?? "";
    let baseNode: MathNode = { type: "text", value };

    // Check for superscript/subscript
    while (i < tokens.length && (tokens[i] === "^" || tokens[i] === "_")) {
      if (tokens[i] === "^") {
        i++;
        const { node: script, end } = parseGroup(tokens, i, originalLatex);
        baseNode = { type: "superscript", base: baseNode, script };
        i = end;
      } else if (tokens[i] === "_") {
        i++;
        const { node: script, end } = parseGroup(tokens, i, originalLatex);
        baseNode = { type: "subscript", base: baseNode, script };
        i = end;
      }
    }

    return { node: baseNode, end: i };
  }

  // Regular character
  i++;
  let baseNode: MathNode = { type: "text", value: token };

  // Check for superscript/subscript
  while (i < tokens.length && (tokens[i] === "^" || tokens[i] === "_")) {
    const op = tokens[i];
    i++;
    const { node: script, end } = parseGroup(tokens, i, originalLatex);

    if (op === "^") {
      if (baseNode.type === "subscript") {
        // Convert to subsuperscript
        baseNode = {
          type: "subsuperscript",
          base: baseNode.base,
          sub: baseNode.script,
          sup: script,
        };
      } else {
        baseNode = { type: "superscript", base: baseNode, script };
      }
    } else {
      if (baseNode.type === "superscript") {
        // Convert to subsuperscript
        baseNode = {
          type: "subsuperscript",
          base: baseNode.base,
          sub: script,
          sup: baseNode.script,
        };
      } else {
        baseNode = { type: "subscript", base: baseNode, script };
      }
    }
    i = end;
  }

  return { node: baseNode, end: i };
}

function parse(latex: string): MathNode {
  const tokens = tokenize(latex);
  const children: MathNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const { node, end } = parseExpr(tokens, i, latex);
    children.push(node);
    i = end;
  }

  return children.length === 1 ? children[0] : { type: "group", children };
}

function nodeToText(node: MathNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "group":
      return node.children.map(nodeToText).join("");
    case "superscript":
      return nodeToText(node.base) + "^" + nodeToText(node.script);
    case "subscript":
      return nodeToText(node.base) + "_" + nodeToText(node.script);
    case "subsuperscript":
      return nodeToText(node.base) + "_" + nodeToText(node.sub) + "^" +
        nodeToText(node.sup);
    case "fraction":
      return "(" + nodeToText(node.numerator) + "/" +
        nodeToText(node.denominator) + ")";
  }
}

type MathChild =
  | MathRun
  | MathFraction
  | MathSuperScript
  | MathSubScript
  | MathSubSuperScript;

function nodeToDocx(node: MathNode): MathChild[] {
  switch (node.type) {
    case "text":
      return [new MathRun(node.value)];

    case "group":
      return node.children.flatMap(nodeToDocx);

    case "fraction":
      return [
        new MathFraction({
          numerator: nodeToDocx(node.numerator),
          denominator: nodeToDocx(node.denominator),
        }),
      ];

    case "superscript":
      return [
        new MathSuperScript({
          children: nodeToDocx(node.base),
          superScript: nodeToDocx(node.script),
        }),
      ];

    case "subscript":
      return [
        new MathSubScript({
          children: nodeToDocx(node.base),
          subScript: nodeToDocx(node.script),
        }),
      ];

    case "subsuperscript":
      return [
        new MathSubSuperScript({
          children: nodeToDocx(node.base),
          subScript: nodeToDocx(node.sub),
          superScript: nodeToDocx(node.sup),
        }),
      ];
  }
}

export function latexToDocxMath(latex: string): DocxMath {
  const ast = parse(latex);
  const children = nodeToDocx(ast);
  return new DocxMath({ children });
}
