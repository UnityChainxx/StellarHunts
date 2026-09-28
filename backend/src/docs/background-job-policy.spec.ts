import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const BACKEND_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SRC_ROOT = join(BACKEND_ROOT, 'src');
const POLICY_PATH = join(REPO_ROOT, 'docs', 'background-job-policy.md');

const OVERLAP_VOCABULARY = [
  'process-local guard',
  'database row lock (`FOR UPDATE SKIP LOCKED`)',
  'none',
];
const CONTAINMENT_VOCABULARY = ['yes', 'no'];

interface ScheduledJob {
  file: string;
  line: number;
  method: string;
  expression: string;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

function collectScheduledJobs(): ScheduledJob[] {
  const jobs: ScheduledJob[] = [];
  for (const absolute of sourceFiles(SRC_ROOT)) {
    const lines = readFileSync(absolute, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index++) {
      const decorator = /^\s*@(Cron|Interval|Timeout)\((.+)\)\s*$/.exec(
        lines[index],
      );
      if (!decorator) {
        continue;
      }
      let method = '';
      for (let next = index + 1; next < Math.min(index + 6, lines.length); next++) {
        const signature = /(?:async\s+)?(\w+)\s*\(/.exec(lines[next]);
        if (signature) {
          method = signature[1];
          break;
        }
      }
      jobs.push({
        file: `backend/src/${relativeToSrc(absolute)}`,
        line: index + 1,
        method,
        expression: decorator[2],
      });
    }
  }
  return jobs;
}

function relativeToSrc(absolute: string): string {
  return absolute.slice(SRC_ROOT.length + 1).split(/[\\/]/).join('/');
}

function methodBody(source: string, startLine: number): string {
  const lines = source.split('\n');
  const collected: string[] = [];
  let depth = 0;
  let opened = false;
  for (let index = startLine; index < lines.length; index++) {
    const line = lines[index];
    collected.push(line);
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (line.includes('{')) {
      opened = true;
    }
    if (opened && depth <= 0 && index > startLine) {
      break;
    }
  }
  return collected.join('\n');
}

type Overlap = 'process-local guard' | 'database row lock' | 'none';
type Containment = 'yes' | 'no';

const GUARD_RE = /if \(this\.(?:isProcessing|running)\)/;

function deriveFacts(job: ScheduledJob): { overlap: Overlap; contained: Containment } {
  const source = readFileSync(join(REPO_ROOT, job.file), 'utf8');
  let body = methodBody(source, job.line - 1);
  for (const delegated of [...body.matchAll(/await this\.(\w+)\(/g)].map((m) => m[1])) {
    const target = new RegExp(`\\n  (?:private |public )?async ${delegated}\\(`).exec(source);
    if (target) {
      body += '\n' + methodBody(source, source.slice(0, target.index).split('\n').length);
    }
  }
  const overlap: Overlap = GUARD_RE.test(body)
    ? 'process-local guard'
    : body.includes('SKIP LOCKED')
      ? 'database row lock'
      : 'none';
  const contained: Containment =
    /\btry\s*\{/.test(body) && /\bcatch\b/.test(body) ? 'yes' : 'no';
  return { overlap, contained };
}

interface TableRow {
  cells: string[];
  line: number;
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^-+$/.test(cell));
}

function tableRows(markdown: string, heading: string): TableRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    throw new Error(`heading not found: ${heading}`);
  }
  const split = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

  const rows: TableRow[] = [];
  let seenBody = false;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (!line.startsWith('|')) {
      if (seenBody) {
        break;
      }
      continue;
    }
    const cells = split(line);
    // A separator row closes the header; the header itself is the row above it.
    if (isSeparator(cells)) {
      continue;
    }
    if (index + 1 < lines.length && lines[index + 1].startsWith('|') && isSeparator(split(lines[index + 1]))) {
      seenBody = true;
      continue;
    }
    seenBody = true;
    rows.push({ cells, line: index + 1 });
  }
  return rows;
}

const policy = readFileSync(POLICY_PATH, 'utf8');
const jobs = collectScheduledJobs();

describe('docs/background-job-policy.md', () => {
  describe('scheduled job inventory', () => {
    const rows = tableRows(policy, '## Scheduled job inventory');

    it('documents at least one scheduled job', () => {
      expect(rows.length).toBeGreaterThan(0);
    });

    it('covers every scheduled job in the backend exactly once', () => {
      const documented = rows.map((row) => {
        const method = /`(\w+)`/.exec(row.cells[0]);
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[1]);
        return {
          method: method ? method[1] : null,
          file: source ? source[1] : null,
          line: source ? Number(source[2]) : null,
        };
      });

      for (const entry of documented) {
        expect(entry.method).not.toBeNull();
        expect(entry.file).not.toBeNull();
        expect(entry.line).not.toBeNull();
      }

      const key = (method: string | null, file: string | null, line: number | null) =>
        `${file}:${line} ${method}`;
      const documentedKeys = new Set(documented.map((d) => key(d.method, d.file, d.line)));
      expect(documentedKeys.size).toBe(documented.length);

      const sourceKeys = new Set(
        jobs.map((job) => `${job.file}:${job.line} ${job.method}`),
      );

      const missing = [...sourceKeys].filter((entry) => !documentedKeys.has(entry));
      const extra = [...documentedKeys].filter((entry) => !sourceKeys.has(entry));

      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      expect(documented.length).toBe(jobs.length);
    });

    it('points every inventory row at the real decorator for that job', () => {
      for (const row of rows) {
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[1]);
        expect(source).not.toBeNull();
        const absolute = join(REPO_ROOT, source![1]);
        expect(existsSync(absolute)).toBe(true);
        const line = readFileSync(absolute, 'utf8').split('\n')[Number(source![2]) - 1];
        expect(line).toMatch(/^\s*@(Cron|Interval|Timeout)\(/);
      }
    });

    it('states an overlap-protection status from the known vocabulary', () => {
      for (const row of rows) {
        expect(OVERLAP_VOCABULARY).toContain(row.cells[3]);
      }
    });

    it('states error containment for every job', () => {
      for (const row of rows) {
        expect(CONTAINMENT_VOCABULARY).toContain(row.cells[4]);
      }
    });

    it('reports the real overlap protection for each job, not a hopeful guess', () => {
      const actual = rows.map((row) => {
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[1])!;
        const job: ScheduledJob = {
          file: source[1],
          line: Number(source[2]),
          method: /`(\w+)`/.exec(row.cells[0])![1],
          expression: '',
        };
        const facts = deriveFacts(job);
        const expected =
          facts.overlap === 'database row lock'
            ? 'database row lock (`FOR UPDATE SKIP LOCKED`)'
            : facts.overlap;
        return { job: `${job.file}:${job.line}`, documented: row.cells[3], actual: expected };
      });
      expect(actual.filter((entry) => entry.documented !== entry.actual)).toEqual([]);
    });

    it('reports real error containment for each job', () => {
      const actual = rows.map((row) => {
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[1])!;
        const job: ScheduledJob = {
          file: source[1],
          line: Number(source[2]),
          method: /`(\w+)`/.exec(row.cells[0])![1],
          expression: '',
        };
        return {
          job: `${job.file}:${job.line}`,
          documented: row.cells[4],
          actual: deriveFacts(job).contained,
        };
      });
      expect(actual.filter((entry) => entry.documented !== entry.actual)).toEqual([]);
    });
  });

  describe('process-local guard limitation', () => {
    it('warns that a process-local guard does not cover multiple replicas', () => {
      expect(policy).toMatch(
        /process-local guard does not protect against multiple replicas/i,
      );
    });

    it('says a distributed lock is required for multi-replica deployments', () => {
      expect(policy).toMatch(/requires a distributed lock/i);
    });
  });

  describe('control values', () => {
    const rows = tableRows(policy, '## Control values');

    it('declares at least one control', () => {
      expect(rows.length).toBeGreaterThan(0);
    });

    it('matches every declared value against the constant in the cited source', () => {
      for (const row of rows) {
        const identifier = row.cells[1].replace(/`/g, '');
        const declared = row.cells[2].replace(/`/g, '');
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[3]);
        expect(source).not.toBeNull();

        const absolute = join(REPO_ROOT, source![1]);
        expect(existsSync(absolute)).toBe(true);
        const cited = readFileSync(absolute, 'utf8').split('\n')[Number(source![2]) - 1];

        expect(cited).toContain(identifier);
        const actual = new RegExp(`${identifier}\\s*(?::[^=]+)?=\\s*([\\d_]+)`).exec(cited);
        expect(actual).not.toBeNull();
        expect(actual![1].replace(/_/g, '')).toBe(declared.replace(/_/g, ''));
      }
    });
  });

  describe('cited paths', () => {
    it('references only files that exist', () => {
      const cited = policy.matchAll(/`(backend\/src\/[^`:]+)(?::\d+)?`/g);
      const paths = [...new Set([...cited].map((match) => match[1]))];
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect({ path, exists: existsSync(join(REPO_ROOT, path)) }).toEqual({
          path,
          exists: true,
        });
      }
    });

    it('cites lines that exist and point at real code, not a blank or a brace', () => {
      const cited = [
        ...new Set([...policy.matchAll(/`(backend\/src\/[^`:]+):(\d+)`/g)].map((m) => ({
          file: m[1],
          line: Number(m[2]),
        }))),
      ];
      expect(cited.length).toBeGreaterThan(0);
      for (const { file, line } of cited) {
        const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
        const text = lines[line - 1];
        expect({ file, line, defined: text !== undefined }).toEqual({
          file,
          line,
          defined: true,
        });
        expect(text.trim()).not.toBe('');
        expect(text.trim()).not.toMatch(/^[}\])]+,?$/);
      }
    });
  });

  describe('mechanism references', () => {
    const rows = tableRows(policy, '## Mechanism references');

    it('declares at least one mechanism', () => {
      expect(rows.length).toBeGreaterThan(0);
    });

    it('finds the named token on the exact cited line', () => {
      const checked = rows.map((row) => {
        const token = row.cells[1].replace(/`/g, '');
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[2])!;
        const text = readFileSync(join(REPO_ROOT, source[1]), 'utf8').split('\n')[
          Number(source[2]) - 1
        ];
        return { mechanism: row.cells[0], source: source[1] + ':' + source[2], found: text.includes(token) };
      });
      expect(checked.filter((entry) => !entry.found)).toEqual([]);
    });
  });

  describe('line citations', () => {
    function verifiedCitations(): Set<string> {
      const verified = new Set<string>();
      for (const [heading, lineColumn] of [
        ['## Scheduled job inventory', 1],
        ['## Control values', 3],
        ['## Mechanism references', 2],
      ] as const) {
        for (const row of tableRows(policy, heading)) {
          const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[lineColumn]);
          if (source) {
            verified.add(`${source[1]}:${source[2]}`);
          }
        }
      }
      return verified;
    }

    it('has no line citation in prose that a table does not verify', () => {
      const verified = verifiedCitations();
      expect(verified.size).toBeGreaterThan(0);
      const cited = [
        ...new Set([...policy.matchAll(/`(backend\/src\/[^`:]+):(\d+)`/g)].map((m) => `${m[1]}:${m[2]}`)),
      ];
      expect(cited.filter((entry) => !verified.has(entry))).toEqual([]);
    });

    it('has no line citation that points past the end of its file', () => {
      for (const { file, line } of [
        ...new Map(
          [...policy.matchAll(/`(backend\/src\/[^`:]+):(\d+)`/g)].map((m) => [
            m[1] + ':' + m[2],
            { file: m[1], line: Number(m[2]) },
          ]),
        ).values(),
      ]) {
        const total = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n').length;
        expect(line).toBeLessThanOrEqual(total);
      }
    });
  });

  describe('summary counts', () => {
    const rows = tableRows(policy, '## Scheduled job inventory');
    const total = rows.length;
    const overlap = (label: string) => rows.filter((row) => row.cells[3] === label).length;
    const guarded = overlap('process-local guard');
    const locked = overlap('database row lock (`FOR UPDATE SKIP LOCKED`)');
    const bare = overlap('none');
    const notContained = rows.filter((row) => row.cells[4] === 'no').length;

    it('counts the inventory the way the prose describes it', () => {
      expect(total).toBe(jobs.length);
      expect(guarded + locked + bare).toBe(total);
      const flat = policy.replace(/\s+/g, ' ');
      expect(flat).toContain(
        `Only ${guarded} of the ${total} scheduled jobs carry an in-process execution guard`,
      );
      expect(flat).toContain(
        `for the ${bare} jobs that are neither process-guarded nor database-locked`,
      );
      expect(flat).toContain(`All ${total} \`@Cron\` jobs in \`backend/src\` are listed`);
      expect(flat).toContain(`- ${notContained} jobs do not catch their own failures`);
      expect(flat).toContain(`the ${notContained} jobs listed as "no" in the inventory`);
      expect(flat).toContain(
        `An attempt counter or last-error record for the ${bare} unprotected jobs`,
      );
      expect(flat).toContain(`the remaining ${bare} unprotected jobs some form of protection`);
    });

    it('does not claim a process-local guard protects multiple replicas', () => {
      const guardedRows = rows.filter((row) => row.cells[3] === 'process-local guard');
      expect(guardedRows.length).toBeGreaterThan(0);
      expect(policy).toMatch(
        /process-local guard does not protect against multiple replicas/i,
      );
      for (const row of guardedRows) {
        const source = /`(backend\/src\/[^`]+):(\d+)`/.exec(row.cells[1])!;
        const text = readFileSync(join(REPO_ROOT, source[1]), 'utf8');
        expect(text).toMatch(/private\s+(isProcessing|running)\s*=\s*false/);
      }
    });
  });

  describe('gap labelling', () => {
    it('separates implemented controls from requirements that are not met', () => {
      expect(policy).toMatch(/## Requirements not yet met/);
      const gapSection = policy.slice(policy.indexOf('## Requirements not yet met'));
      expect(gapSection).toMatch(/^\d+\. /m);
    });
  });
});
