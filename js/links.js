// Liens : boutons de l'UserForm et liens cachés (module Liens du VBA).
// Un lien dont les données manquent (rs absent, pas de clé MobiDetails…) est
// renvoyé avec url = null : l'interface l'affiche désactivé plutôt que de le cacher.

const enc = encodeURIComponent;

/** Lien UCSC : fenêtre de ±250 pb, variant surligné (Annotation.UCSC_link). */
function ucscLink(chr, pos, session) {
  const c = `chr${chr}`;
  const base = session
    ? `http://genome-euro.ucsc.edu/s/JeanMarieRavel/${session}?`
    : 'https://genome-euro.ucsc.edu/cgi-bin/hgTracks?db=hg38'
      + '&hideTracks=1&hgt.out0=submit&ignoreCookie=1'
      + '&ncbiRefSeqSelect=full&clinvarMain=pack&clinvarSubLolly=pack'
      + '&omimGene2=full&orphadata=full'
      + '&knownGene=pack&multiz100way=pack&unipDomain=pack&unipFullSeq=pack&';
  return `${base}position=${c}%3A${pos - 250}%2D${pos + 250}`
    + `&highlight=hg38.${c}%3A${pos}%2D${pos}`;
}

/**
 * @param {object} ctx  résultat de annotate()
 * @param {object} opts { lang, mobiKey }
 * @returns {Array<{id,label,url,group,note}>}
 */
export function buildLinks(ctx, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'fr';
  const v = ctx.variant;
  const gene = v.gene;
  const vcf = v.pseudoVcf;
  const { chr, pos, ref, alt } = v;
  const cPart = v.hgvsc ? v.hgvsc.split(':').slice(1).join(':') : null;
  const nomen = cPart && v.transcript ? `${v.transcript}(${gene}):${cPart}` : v.hgvsc;
  const rs = ctx.rsid;
  const uniprot = ctx.gene.uniprot;
  const hgnc = ctx.gene.hgncId;
  const geneId = ctx.gene.ncbiGeneId;
  const mim = ctx.gene.mim;

  const L = (id, label, url, group, note = null) => ({ id, label, url: url || null, group, note });

  return [
    // — Gène et maladie
    L('omim', 'OMIM', mim
      ? `https://omim.org/entry/${mim}`
      : `https://www.omim.org/search?index=entry&search=${enc(gene || '')}`,
    'gene', mim ? null : (lang === 'fr' ? 'recherche par gène' : 'gene search')),
    L('orphanet', 'Orphanet', gene
      ? `https://www.orpha.net/${lang}/disease/gene/${enc(gene)}`
      : null, 'gene'),
    L('clingen', 'ClinGen', hgnc
      ? `https://search.clinicalgenome.org/kb/genes/HGNC:${enc(hgnc)}`
      : null, 'gene'),
    L('panelapp', 'PanelApp', gene
      ? `https://panelapp.genomicsengland.co.uk/panels/entities/${enc(gene)}`
      : null, 'gene'),
    L('lovd', 'LOVD', gene
      ? `https://databases.lovd.nl/shared/genes/${enc(gene)}`
      : null, 'gene'),
    L('mane', 'MANE (nuccore)', gene
      ? `https://ncbi.nlm.nih.gov/nuccore/?term=${enc(gene)}[gene]%20AND%20MANE%20Select[keyword]&report=accnlist`
      : null, 'gene'),
    L('uniprot', 'UniProt', uniprot
      ? `https://www.uniprot.org/uniprotkb/${enc(uniprot)}/entry#family_and_domains`
      : null, 'gene'),

    // — Variant : bases cliniques
    L('clinvar', 'ClinVar', nomen
      ? `https://www.ncbi.nlm.nih.gov/clinvar/?term=${enc(nomen)}`
      : null, 'variant'),
    L('decipher', 'Decipher', vcf && gene
      ? `https://www.deciphergenomics.org/sequence-variant/${vcf}/genes/${enc(gene)}/protein-genomic-info`
      : null, 'variant'),
    L('varsome', 'Varsome', vcf
      ? `https://varsome.com/variant/hg38/${vcf}`
      : null, 'variant'),
    L('franklin', 'Franklin', vcf
      ? `https://franklin.genoox.com/clinical-db/variant/snp/${vcf}-hg38?app=assessment-tools`
      : null, 'variant'),
    L('mobidetails', 'MobiDetails', ctx.mobiDetailsId
      ? `https://mobidetails.chu-montpellier.fr/variants/${ctx.mobiDetailsId}`
      : 'https://mobidetails.chu-montpellier.fr/',
    'variant', ctx.mobiDetailsId ? null : (lang === 'fr' ? "page d'accueil (pas de clé)" : 'home page (no key)')),
    L('intervar', 'InterVar', ref
      ? `https://wintervar.wglab.org/results.pos.php?queryType=position&chr=${chr}&pos=${pos}&ref=${ref}&alt=${alt}&build=hg38`
      : null, 'variant'),

    // — Populations
    L('gnomad4', 'gnomAD r4', vcf
      ? `https://gnomad.broadinstitute.org/variant/${vcf}?dataset=gnomad_r4`
      : null, 'pop'),
    L('gnomad2', 'gnomAD r2_1', vcf
      ? `https://gnomad.broadinstitute.org/variant/${vcf}?dataset=gnomad_r2_1`
      : null, 'pop', lang === 'fr' ? 'coordonnées hg38' : 'hg38 coordinates'),
    L('dbsnp', 'dbSNP', rs
      ? `https://www.ncbi.nlm.nih.gov/snp/${enc(rs)}`
      : null, 'pop'),

    // — Prédiction et annotation
    L('cadd', 'CADD', ref
      ? `https://cadd.gs.washington.edu/api/v1.0/GRCh38-v1.6/${chr}:${pos}_${ref}_${alt}`
      : null, 'pred', lang === 'fr' ? 'lien seul (pas de CORS)' : 'link only (no CORS)'),
    L('vep', 'VEP', v.hgvsc
      ? `https://rest.ensembl.org/vep/human/hgvs/${enc(v.hgvsc)}?content-type=application/xml;refseq=1`
      : null, 'pred'),
    L('vepsplice', 'VEP splice', v.hgvsc
      ? `https://rest.ensembl.org/vep/human/hgvs/${enc(v.hgvsc)}?content-type=application/xml;refseq=1`
        + ';GeneSplicer=1;MaxEntScan=1;SpliceAI=1;SpliceRegion=1;dbscSNV=1'
      : null, 'pred'),
    L('myvariant', 'MyVariant.info', v.myVariantId
      ? `https://myvariant.info/v1/variant/${enc(v.myVariantId)}?assembly=hg38`
      : null, 'pred'),
    L('ucscSnv', 'UCSC — SNV', pos ? ucscLink(chr, pos, 'SNV_hg38') : null, 'pred'),
    L('ucscPcr', 'UCSC — Design PCR', pos ? ucscLink(chr, pos, 'DesignPCR_hg38') : null, 'pred'),

    // — Littérature
    L('pubmed', 'PubMed', gene
      ? 'https://www.ncbi.nlm.nih.gov/pubmed/?term='
        + enc(`"${gene}"[tiab] AND (variant OR mutation OR mutant) NOT (somatic OR tumour)`)
        + '&size=100'
      : null, 'lit'),
    L('pubtator', 'PubTator', geneId
      ? `https://www.ncbi.nlm.nih.gov/research/pubtator/?view=docsum&query=@gene@${enc(geneId)}`
      : null, 'lit'),
    L('litvar', 'LitVar2', rs
      ? `https://www.ncbi.nlm.nih.gov/research/litvar2/docsum?variant=litvar@${enc(rs)}%23%23&query=${enc(rs)}`
      : null, 'lit'),
    L('mastermind', 'Mastermind', gene && cPart
      ? `https://mastermind.genomenon.com/detail?gene=${enc(gene)}&mutation=${enc(`${gene}:${cPart}`)}`
        + '&boolean=true&gene_op=and&mutation_op=and&cnv_op=and&disease_op=or&hpo_op=or&unii_op=or&keyword_op=and'
      : null, 'lit'),
  ];
}

export const LINK_GROUPS = {
  fr: { gene: 'Gène et maladie', variant: 'Variant', pop: 'Populations', pred: 'Prédiction et annotation', lit: 'Littérature' },
  en: { gene: 'Gene and disease', variant: 'Variant', pop: 'Populations', pred: 'Prediction and annotation', lit: 'Literature' },
};
