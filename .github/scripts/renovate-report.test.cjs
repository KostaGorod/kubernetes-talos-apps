const assert = require('node:assert/strict');
const test = require('node:test');
const { snapshot, report } = require('./renovate-report.cjs');

const files = {
  'gitops/apps/bentopdf/app.yaml': 'ghcr.io/alam00000/bentopdf-simple:v2.8.8@sha256:aaa',
  'gitops/apps/bentopdf/managed-tunnel.yaml': 'cloudflare/cloudflared:2026.9.1@sha256:bbb',
};
const context = { repo: { owner: 'example', repo: 'apps' } };
const ref = (branch, sha) => ({ ref: `refs/heads/${branch}`, object: { sha } });
const pr = (number, branch, sha) => ({ number, head: { ref: branch, sha }, base: { sha: 'base-sha' } });

// Simulate only GitHub's documented API boundary; report generation stays real.
function api({ prs = [], refs = [], proposals = {}, ahead = 1, contentError, revision = 'main-sha' } = {}) {
  return {
    rest: {
      repos: {
        getBranch: async () => ({ data: { commit: { sha: revision } } }),
        getContent: async ({ path, ref: revision }) => {
          if (contentError) throw new Error(contentError);
          const image = proposals[revision]?.[path] ?? files[path];
          return { data: { content: Buffer.from(`image: ${image}\n`).toString('base64') } };
        },
        compareCommitsWithBasehead: async () => ({ data: { ahead_by: ahead,
          merge_base_commit: { sha: 'base-sha' } } }),
      },
      pulls: { list: 'pulls' },
      git: { listMatchingRefs: 'refs' },
    },
    paginate: async (method) => method === 'pulls' ? prs : refs,
  };
}
function output() {
  const messages = [];
  const failures = [];
  const summaries = [];
  return {
    messages, failures, summaries,
    info: (value) => messages.push(value),
    setFailed: (value) => failures.push(value),
    summary: { addRaw: (value) => { summaries.push(value); return { write: async () => {} }; } },
  };
}

test('reports created PR with before/after main separate from the proposal', async () => {
  const before = await snapshot({ github: api(), context });
  const branch = 'renovate-manual/bento';
  const github = api({
    prs: [pr(14, branch, 'new-sha')], refs: [ref(branch, 'new-sha')],
    proposals: { 'new-sha': { ...files, 'gitops/apps/bentopdf/app.yaml':
      'ghcr.io/alam00000/bentopdf-simple:2.8.10@sha256:ccc' } },
  });
  const core = output();
  await report({ github, context, core, before, outcome: 'success' });
  const summary = core.summaries.join('');
  assert.match(summary, /v2\.8\.8/);
  assert.match(summary, /2\.8\.10/);
  assert.match(summary, /PR created/);
  assert.match(summary, /\/pull\/14/);
  assert.match(summary, /Kept on main; no PR proposal/);
  assert.match(summary, /No merge or deployment/);
  assert.equal(core.failures.length, 0);
});

test('reused and updated PRs are not claimed as newly created', async () => {
  for (const [oldSha, expected] of [['new-sha', 'PR reused'], ['old-sha', 'PR updated']]) {
    const branch = 'renovate-manual/tunnel';
    const before = await snapshot({ github: api({ prs: [pr(15, branch, oldSha)] }), context });
    const github = api({ prs: [pr(15, branch, 'new-sha')], refs: [ref(branch, 'new-sha')],
      proposals: { 'new-sha': { ...files, 'gitops/apps/bentopdf/managed-tunnel.yaml':
        'cloudflare/cloudflared:2026.10.4@sha256:ddd' } } });
    const core = output();
    await report({ github, context, core, before, outcome: 'success' });
    assert.match(core.summaries.join(''), new RegExp(expected));
    assert.doesNotMatch(core.summaries.join(''), /PR created/);
  }
});

test('missing PR fails but still writes a readable report on updater failure', async () => {
  const before = await snapshot({ github: api(), context });
  const core = output();
  await report({ github: api({ refs: [ref('renovate-manual/orphan', 'orphan-sha')] }),
    context, core, before, outcome: 'failure' });
  assert.equal(core.failures.length, 1);
  assert.match(core.failures[0], /without PRs/);
  assert.match(core.summaries.join(''), /Updater outcome: failure/);
  assert.doesNotMatch(core.summaries.join(''), /up.to.date|latest/i);
});

test('no changes and already incorporated branches pass without claiming latest', async () => {
  const before = await snapshot({ github: api(), context });
  const core = output();
  await report({ github: api({ refs: [ref('renovate-manual/merged', 'merged-sha')], ahead: 0 }),
    context, core, before, outcome: 'success' });
  assert.equal(core.failures.length, 0);
  assert.match(core.summaries.join(''), /Kept on main; no PR proposal/);
  assert.doesNotMatch(core.summaries.join(''), /up.to.date|latest/i);
});

test('content lookup failure is not converted to an unchanged success', async () => {
  await assert.rejects(snapshot({ github: api({ contentError: 'API unavailable' }), context }), /API unavailable/);
});

test('stale PR does not report an unchanged sibling image as a proposed downgrade', async () => {
  const before = await snapshot({ github: api(), context });
  const branch = 'renovate-manual/tunnel';
  const core = output();
  const result = await report({ github: api({
    revision: 'advanced-main', prs: [pr(15, branch, 'old-branch')],
    refs: [ref(branch, 'old-branch')], proposals: {
      'advanced-main': { ...files, 'gitops/apps/bentopdf/app.yaml':
        'ghcr.io/alam00000/bentopdf-simple:2.8.10@sha256:ccc' },
      'old-branch': { ...files, 'gitops/apps/bentopdf/managed-tunnel.yaml':
        'cloudflare/cloudflared:2026.10.4@sha256:ddd' },
    },
  }), context, core, before, outcome: 'success' });
  const bento = result.rows.find((row) => row[0] === 'BentoPDF');
  assert.equal(bento[3], 'None');
  assert.match(bento[4], /Main changed concurrently/);
  assert.match(core.summaries.join(''), /Main advanced during the run/);
});
