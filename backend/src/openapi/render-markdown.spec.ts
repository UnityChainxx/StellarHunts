import {
  collectOperations,
  renderOpenApiMarkdown,
  resolveAuthLabel,
  slugifyHeading,
  type OpenApiDocumentLike,
} from './render-markdown';

function document(): OpenApiDocumentLike {
  return {
    info: { title: 'StellarHunts API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    security: [],
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in and receive a JWT',
          security: [],
        },
      },
      '/auth/profile': {
        get: {
          tags: ['Auth'],
          summary: 'Get the authenticated user profile',
          security: [{ bearer: [] }],
        },
      },
      '/admin/puzzles': {
        post: {
          tags: ['Admin'],
          summary: 'Create a puzzle',
          'x-auth': 'JWT + Admin',
        },
      },
      '/health/live': {
        get: { tags: ['Health'], summary: 'Liveness probe' },
      },
    },
  };
}

describe('renderOpenApiMarkdown', () => {
  it('includes the document metadata and the regeneration command', () => {
    const markdown = renderOpenApiMarkdown(document());

    expect(markdown).toContain('# StellarHunts API Reference');
    expect(markdown).toContain('**API version:** 1.0.0');
    expect(markdown).toContain('**Base URL:** `/api/v1`');
    expect(markdown).toContain('(api-conventions.md)');
    expect(markdown).toContain('npm --prefix backend run openapi:generate');
    expect(markdown).toContain('do not edit it by hand');
  });

  it('groups operations by tag in first-appearance order', () => {
    const markdown = renderOpenApiMarkdown(document());
    const contents = markdown.slice(markdown.indexOf('## Contents'));

    expect(contents.indexOf('## Auth')).toBeLessThan(contents.indexOf('## Admin'));
    expect(contents.indexOf('## Admin')).toBeLessThan(contents.indexOf('## Health'));
    expect(markdown).toContain('- [Auth](#auth)');
    expect(markdown).toContain('- [Admin](#admin)');
    expect(markdown).toContain('- [Health](#health)');
  });

  it('renders a row per operation with method, path, auth and description', () => {
    const markdown = renderOpenApiMarkdown(document());

    expect(markdown).toContain('| POST | `/auth/login` | Public | Log in and receive a JWT |');
    expect(markdown).toContain(
      '| GET | `/auth/profile` | JWT | Get the authenticated user profile |',
    );
    expect(markdown).toContain('| POST | `/admin/puzzles` | JWT + Admin | Create a puzzle |');
    expect(markdown).toContain('| GET | `/health/live` | Public | Liveness probe |');
  });

  it('always documents the standard error responses', () => {
    const markdown = renderOpenApiMarkdown(document());

    expect(markdown).toContain('## Error Responses');
    expect(markdown).toContain('| 401 | Unauthorized (missing or invalid JWT) |');
    expect(markdown).toContain('"statusCode": 400');
  });

  it('is deterministic', () => {
    const first = renderOpenApiMarkdown(document());
    const second = renderOpenApiMarkdown(document());

    expect(first).toBe(second);
  });

  it('renders an explicit note when there are no operations', () => {
    const markdown = renderOpenApiMarkdown({
      info: { title: 'Empty API', version: '0.0.1' },
      paths: {},
    });

    expect(markdown).toContain('_No operations were found in the OpenAPI document._');
  });
});

describe('resolveAuthLabel', () => {
  const doc = document();

  it('prefers an explicit x-auth extension over security schemes', () => {
    expect(
      resolveAuthLabel({ security: [{ bearer: [] }], 'x-auth': 'JWT + Admin' }, doc),
    ).toBe('JWT + Admin');
  });

  it('maps the bearer scheme to JWT', () => {
    expect(resolveAuthLabel({ security: [{ bearer: [] }] }, doc)).toBe('JWT');
  });

  it('treats an empty security array as public', () => {
    expect(resolveAuthLabel({ security: [] }, doc)).toBe('Public');
  });

  it('falls back to the document-level security when the operation omits it', () => {
    expect(resolveAuthLabel({}, { ...doc, security: [{ bearer: [] }] })).toBe('JWT');
  });

  it('defaults to public when no security is declared anywhere', () => {
    expect(resolveAuthLabel({}, { ...doc, security: undefined })).toBe('Public');
  });
});

describe('collectOperations', () => {
  it('lists methods in a stable HTTP order inside a path', () => {
    const groups = collectOperations({
      info: { title: 't', version: '1' },
      paths: {
        '/things': {
          delete: { tags: ['Things'] },
          get: { tags: ['Things'] },
          post: { tags: ['Things'] },
        },
      },
    });

    expect(groups.get('Things')?.map((row) => row.method)).toEqual([
      'GET',
      'POST',
      'DELETE',
    ]);
  });

  it('escapes pipe characters and newlines in summaries', () => {
    const groups = collectOperations({
      info: { title: 't', version: '1' },
      paths: {
        '/x': { get: { tags: ['X'], summary: 'a | b\nc' } },
      },
    });

    expect(groups.get('X')?.[0].summary).toBe('a \\| b c');
  });
});

describe('slugifyHeading', () => {
  it('produces GitHub-style anchors', () => {
    expect(slugifyHeading('Puzzle Submission')).toBe('puzzle-submission');
    expect(slugifyHeading('NFT Claim')).toBe('nft-claim');
  });
});
