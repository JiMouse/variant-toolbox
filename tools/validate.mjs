#!/usr/bin/env node
// Exécute la chaîne complète (saisie → chiffres → liens → commentaire) hors navigateur,
// pour comparer la sortie web aux commentaires déjà produits par la macro.
//
//   node tools/validate.mjs "chr17-7675088-C-T:5" "NM_000546.6:c.524G>A:4"
//   node tools/validate.mjs --lang en --json "17-7675088-C-T:5"
//
// Les clés API se passent par variables d'environnement : OMIM_KEY, MOBIDETAILS_KEY.

import { normalize } from '../js/variant.js';
import { annotate } from '../js/annotate.js';
import { buildComment } from '../js/comment.js';
import { buildLinks } from '../js/links.js';

const args = process.argv.slice(2);
const opts = { lang: 'fr', json: false, gnomadVersion: 'v4.1', links: false };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--lang') opts.lang = args[++i];
  else if (args[i] === '--json') opts.json = true;
  else if (args[i] === '--links') opts.links = true;
  else if (args[i] === '--gnomad') opts.gnomadVersion = args[++i];
  else inputs.push(args[i]);
}

if (!inputs.length) {
  console.error('usage: node tools/validate.mjs [--lang fr|en] [--json] [--links] "<variant>:<classe>" …');
  process.exit(1);
}

const keys = { omimKey: process.env.OMIM_KEY || null, mobiKey: process.env.MOBIDETAILS_KEY || null };

function predLine(p) {
  const mark = p.verdict === 'del' ? 'délétère' : p.verdict === 'tol' ? 'toléré' : 'n.a.';
  const extra = p.discordant ? `  [valeurs: ${p.discordant.join('/')}]` : '';
  return `  ${p.name.padEnd(14)} ${mark.padEnd(10)} ${p.score}${extra}`;
}

for (const raw of inputs) {
  // « variant:classe » — on ne coupe que sur le dernier « : » suivi d'un chiffre 3/4/5.
  const m = raw.match(/^(.*):([345])$/);
  const query = m ? m[1] : raw;
  const variantClass = m ? Number(m[2]) : 3;

  console.log('='.repeat(100));
  console.log(`SAISIE : ${query}   (classe ${variantClass}, ${opts.lang.toUpperCase()})`);
  console.log('='.repeat(100));
  try {
    const variant = await normalize(query);
    const ctx = await annotate(variant, keys);

    if (opts.json) {
      console.log(JSON.stringify({ variant: { ...ctx.variant, vepRaw: undefined }, ctx: { ...ctx, variant: undefined } }, null, 2));
    } else {
      const g4 = ctx.gnomad['v4.1'];
      const g2 = ctx.gnomad['v2.1.1'];
      console.log(`\nGène ${ctx.gene.symbol} | transcrit ${ctx.variant.transcript}`
        + ` (${ctx.variant.isMane ? 'MANE Select' : `non-MANE, MANE = ${ctx.variant.maneTranscript || '?'}`})`
        + ` | ${ctx.variant.varType} | ${ctx.variant.loc} ${ctx.variant.locField || ''}`);
      console.log(`VCF hg38 ${ctx.variant.pseudoVcf} | ${ctx.variant.hgvsc} | ${ctx.variant.proteinChange || '-'}`
        + ` | rs: ${ctx.rsid || 'n.a.'}`);
      console.log(`InterVar : ${ctx.intervar ? `${ctx.intervar.label} (classe ${ctx.intervar.class}) [${ctx.intervar.criteria.join(' ')}]` : 'n.a.'}`);
      console.log(`ClinVar  : ${ctx.clinvar.count} soumission(s), ${ctx.clinvar.significance || 'n.a.'}`
        + ` [${ctx.clinvar.significances.join(' / ')}]`);
      console.log(`gnomAD v4.1 : ${g4 ? `AC ${g4.ac} / AN ${g4.an} / htz ${g4.het} / hmz ${g4.hom} / AF ${g4.af}` : 'n.a.'}`);
      console.log(`gnomAD v2.1.1 : ${g2 ? `AC ${g2.ac} / htz ${g2.het} / hmz ${g2.hom} / AF ${g2.af}` : 'n.a.'}`);
      console.log('Prédictions :');
      ctx.predictions.forEach((p) => console.log(predLine(p)));
      const c = ctx.conservation;
      console.log(`Conservation : GERP ${c.gerp.score} (${c.gerp.conserved === null ? 'n.a.' : c.gerp.conserved ? 'conservé' : 'peu conservé'})`
        + ` | phyloP ${c.phylop.score} | phastCons ${c.phastcons.score}`);
      console.log(`Domaine : ${ctx.domain || 'n.a.'}`);
      console.log(`Phénotypes (${ctx.phenotypes.source || 'aucune source'}) : ${ctx.phenotypes.phenotypes.length}`);
      ctx.phenotypes.phenotypes.slice(0, 8).forEach((p) => console.log(`  - ${p.name} (MIM ${p.mim || '?'}, ${p.inheritance || '?'})`));
      if (Object.keys(ctx.errors).length) console.log(`\n⚠ sources en échec : ${JSON.stringify(ctx.errors)}`);

      if (opts.links) {
        console.log('\nLIENS');
        buildLinks(ctx, opts).forEach((l) => console.log(`  ${l.url ? '✓' : '✗'} ${l.label.padEnd(20)} ${l.url || '(données manquantes)'}`));
      }

      console.log(`\n--- COMMENTAIRE (${opts.lang.toUpperCase()}) ---`);
      console.log(buildComment(ctx, { ...opts, variantClass }));
      console.log('--- fin ---\n');
    }
  } catch (e) {
    console.log(`ERREUR : ${e.message}`);
  }
}
