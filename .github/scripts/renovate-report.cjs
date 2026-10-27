const targets = [
  { name: 'BentoPDF', path: 'gitops/apps/bentopdf/app.yaml', image: 'ghcr.io/alam00000/bentopdf-simple' },
  { name: 'cloudflared', path: 'gitops/apps/bentopdf/managed-tunnel.yaml', image: 'cloudflare/cloudflared' },
];
const prefix = 'renovate-manual/';

async function imagesAt(github, repo, revision) {
  return Object.fromEntries(await Promise.all(targets.map(async (target) => {
    const { data } = await github.rest.repos.getContent({ ...repo, path: target.path, ref: revision });
    if (!data.content || data.encoding && data.encoding !== 'base64') {
      throw new Error(`Cannot read ${target.path} at ${revision}`);
    }
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    const images = [...text.matchAll(/^\s*image:\s*([^\s#]+)/gm)].map((match) => match[1]);
    const matches = images.filter((image) => image.startsWith(`${target.image}:`));
    if (matches.length !== 1) throw new Error(`Expected one ${target.name} image in ${target.path}`);
    return [target.name, matches[0]];
  })));
}

async function snapshot({ github, context }) {
  const repo = context.repo;
  const { data } = await github.rest.repos.getBranch({ ...repo, branch: 'main' });
  const revision = data.commit.sha;
  const [images, prs] = await Promise.all([
    imagesAt(github, repo, revision),
    github.paginate(github.rest.pulls.list, { ...repo, state: 'open', base: 'main', per_page: 100 }),
  ]);
  return { revision, images, prs: prs.filter((pr) => pr.head.ref.startsWith(prefix)).map((pr) => ({
    number: pr.number, head: { ref: pr.head.ref, sha: pr.head.sha }, base: { sha: pr.base.sha },
  })) };
}

function escape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('\n', ' ');
}
function version(image) {
  const [tagged, digest] = image.split('@');
  const tag = tagged.slice(tagged.lastIndexOf(':') + 1);
  return `${tag}${digest ? ` / ${digest.slice(0, 19)}` : ''}`;
}

async function report({ github, context, core, before, outcome }) {
  const repo = context.repo;
  const after = await snapshot({ github, context });
  const refs = await github.paginate(github.rest.git.listMatchingRefs, {
    ...repo, ref: `heads/${prefix}`, per_page: 100,
  });
  const missing = [];
  for (const ref of refs) {
    const branch = ref.ref.replace('refs/heads/', '');
    const { data } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo, basehead: `${after.revision}...${ref.object.sha}`,
    });
    if (data.ahead_by > 0 && !after.prs.some((pr) => pr.head.ref === branch)) missing.push(branch);
  }
  const proposals = await Promise.all(after.prs.map(async (pr) => {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo, basehead: `${pr.base.sha}...${pr.head.sha}`,
    });
    const [images, baseImages] = await Promise.all([
      imagesAt(github, repo, pr.head.sha), imagesAt(github, repo, data.merge_base_commit.sha),
    ]);
    return { pr, images, baseImages };
  }));
  const oldPrs = new Map((before?.prs ?? []).map((pr) => [pr.number, pr]));
  const rows = [];
  for (const target of targets) {
    const current = after.images[target.name];
    const changes = proposals.filter((item) => item.images[target.name] !== item.baseImages[target.name] &&
      item.images[target.name] !== current);
    const baseline = before?.images[target.name];
    if (changes.length === 0) {
      const status = baseline && baseline !== current ? 'Main changed concurrently; no PR proposal' :
        'Kept on main; no PR proposal';
      rows.push([target.name, baseline ? version(baseline) : 'Unavailable', version(current),
        'None', status, '']);
    }
    for (const { pr, images } of changes) {
      const old = oldPrs.get(pr.number);
      const status = !before ? 'Open PR; baseline unavailable' : !old ? 'PR created' :
        old.head.sha === pr.head.sha ? 'PR reused' : 'PR updated';
      const link = `https://github.com/${repo.owner}/${repo.repo}/pull/${pr.number}`;
      rows.push([target.name, baseline ? version(baseline) : 'Unavailable', version(current),
        version(images[target.name]), status, `[#${pr.number}](${link})`]);
    }
  }
  let markdown = `## Renovate update report\n\nUpdater outcome: ${escape(outcome)}\n\n`;
  markdown += '| Dependency | Main before | Main after | Proposed in PR | Result | PR |\n';
  markdown += '| --- | --- | --- | --- | --- | --- |\n';
  for (const row of rows) markdown += `| ${row.map(escape).join(' | ')} |\n`;
  markdown += '\nVersions include shortened image digests. No merge or deployment is performed by this workflow.\n';
  markdown += 'No PR proposal is not proof of the newest registry release; inspect the updater outcome and log.\n';
  if (before && before.revision !== after.revision) {
    markdown += '\nMain advanced during the run. Main-after values reflect that concurrent change, not a Renovate merge.\n';
  }
  if (missing.length > 0) {
    markdown += `\n**Blocked:** update branches without PRs: ${missing.map(escape).join(', ')}.\n`;
  }
  core.info(`Updater outcome: ${outcome}`);
  for (const row of rows) core.info(row.join(' | '));
  await core.summary.addRaw(markdown).write();
  if (missing.length > 0) {
    core.setFailed(`Renovate left update branches without PRs: ${missing.join(', ')}. ` +
      'Check Settings > Actions > General > Allow GitHub Actions to create and approve pull requests.');
  }
  return { rows, missing };
}

module.exports = { snapshot, report };
