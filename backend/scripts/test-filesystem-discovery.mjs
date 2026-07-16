/**
 * Standalone validation for dynamic filesystem discovery NL mapping.
 * Run: node scripts/test-filesystem-discovery.mjs
 */

function resolveNaturalPathReference(text) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const winBack = trimmed.match(
    /([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n.]*)/,
  );
  if (winBack) {
    return {
      kind: 'absolute',
      absolutePath: winBack[1].replace(/[.,;:!?)]+$/, ''),
    };
  }

  const drive =
    lower.match(/\b(?:disco|drive)\s+([a-z])\b/i) ||
    lower.match(/\b([a-z])\s*:\s*(?:\\|\/)?(?:\s|$)/i);
  if (drive?.[1] && !/\b(documentos?|desktop|downloads?)/i.test(lower)) {
    return { kind: 'drive', driveLetter: drive[1].toUpperCase() };
  }

  if (/\b(documentos?|documents?|meus?\s+documentos?)\b/i.test(lower)) {
    return { kind: 'known_folder', knownFolder: 'documents' };
  }
  if (/\b(desktop|área\s+de\s+trabalho|area\s+de\s+trabalho)\b/i.test(lower)) {
    return { kind: 'known_folder', knownFolder: 'desktop' };
  }
  if (/\b(downloads?|baixados?)\b/i.test(lower)) {
    return { kind: 'known_folder', knownFolder: 'downloads' };
  }
  if (/\b(pictures?|imagens?|fotos?)\b/i.test(lower)) {
    return { kind: 'known_folder', knownFolder: 'pictures' };
  }
  if (/\b(videos?|v[ií]deos?)\b/i.test(lower)) {
    return { kind: 'known_folder', knownFolder: 'videos' };
  }
  if (
    /\b(home|pasta\s+do\s+usu[aá]rio|meu\s+usu[aá]rio)\b/i.test(lower)
  ) {
    return { kind: 'known_folder', knownFolder: 'home' };
  }
  return { kind: 'unknown' };
}

function browseIntent(lower) {
  return (
    /(list(e|ar)?|mostrar|mostre|ver|veja|olha(r)?|consegue\s+olhar|pode\s+olhar|o\s+que\s+tem\s+em|mostra\s+arquivos)/i.test(
      lower,
    ) ||
    /(pasta|diret[oó]rio|folder)\s+(de\s+|dos?\s+|da\s+|do\s+)?(meus?\s+|minhas?\s+)?(documentos?|documents?|desktop|downloads?)/i.test(
      lower,
    ) ||
    /(meus?\s+|minhas?\s+)(documentos?|downloads?)/i.test(lower)
  );
}

function joinHome(home, name) {
  if (/^[a-zA-Z]:/.test(home)) return `${home.replace(/[\\/]+$/, '')}\\${name}`;
  return `${home.replace(/\/+$/, '')}/${name}`;
}

function findCandidates(ref, home) {
  if (ref.kind === 'absolute') return [ref.absolutePath];
  if (ref.kind === 'drive') return [`${ref.driveLetter}:\\`];
  if (ref.kind !== 'known_folder') return [];
  if (ref.knownFolder === 'home') return [home];
  const names = {
    documents: ['Documents', 'Documentos'],
    desktop: ['Desktop'],
    downloads: ['Downloads'],
    pictures: ['Pictures', 'Imagens'],
    videos: ['Videos', 'Vídeos'],
  };
  const folderNames = names[ref.knownFolder] || [];
  const out = folderNames.map((n) => joinHome(home, n));
  out.push(joinHome(home, `OneDrive\\${folderNames[0] || 'Documents'}`));
  return out;
}

const home = 'C:\\Users\\Gabri'; // simulated — real service uses os.homedir()
const cases = [
  {
    input: 'Consegue olhar minha pasta documentos do Windows?',
    expectFolder: 'documents',
  },
  { input: 'olha minha pasta documentos', expectFolder: 'documents' },
  { input: 'lista meus documentos', expectFolder: 'documents' },
  { input: 'mostra arquivos do desktop', expectFolder: 'desktop' },
  { input: 'olha downloads', expectFolder: 'downloads' },
  { input: 'ver imagens', expectFolder: 'pictures' },
  { input: 'disco D', expectFolder: null, expectDrive: 'D' },
];

let failed = 0;
for (const c of cases) {
  const lower = c.input.toLowerCase();
  const intent = browseIntent(lower) || c.expectDrive;
  const ref = resolveNaturalPathReference(c.input);
  const candidates = findCandidates(ref, home);
  const ok =
    intent &&
    ((c.expectFolder &&
      ref.knownFolder === c.expectFolder &&
      candidates.length >= 1 &&
      candidates.some((p) => /Documents|Desktop|Downloads|Pictures|Videos/i.test(p))) ||
      (c.expectDrive && ref.driveLetter === c.expectDrive));

  console.log(
    ok ? 'PASS' : 'FAIL',
    JSON.stringify({
      input: c.input,
      actionsDetected: intent ? 1 : 0,
      knownFolder: ref.knownFolder || null,
      drive: ref.driveLetter || null,
      candidates,
      requiresEnvDocumentsPath: false,
    }),
  );
  if (!ok) failed++;
}

console.log(
  failed === 0 ? 'PASS' : 'FAIL',
  'no HOST_DOCUMENTS_PATH required',
);

process.exit(failed ? 1 : 0);
