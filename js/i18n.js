// Libellés de l'interface. Le texte du commentaire est dans comment.js.

export const UI = {
  fr: {
    tagline: 'Annotation de variations et rédaction du commentaire — version web de la ToolBox SNV',
    inputLabel: 'Variation',
    inputPlaceholder: 'NM_000546.6:c.524G>A   ou   chr17-7675088-C-T',
    inputHelp: 'HGVS sur transcrit RefSeq, GÈNE:c.… ou HGVS g. hg38 (transcrit MANE Select), '
      + 'ou pseudo-VCF hg38 (chr-pos-ref-alt)',
    classLabel: 'Classe du biologiste',
    analyse: 'Analyser',
    analysing: 'Analyse…',
    progressNormalising: 'Normalisation de la variation… ({s} s)',
    progressFallback: 'Ensembl tarde à répondre — repli sur VariantValidator… ({s} s)',
    progressFallbackFailed: 'VariantValidator indisponible — dernière chance laissée '
      + 'à Ensembl… ({s} s)',
    progressAnnotating: 'Interrogation des bases… ({s} s)',
    errTimeout: 'Délai dépassé : aucune source n\u2019a répondu. Relancer l\u2019analyse.',
    settings: 'Clés API',
    settingsHelp: 'Stockées uniquement dans ce navigateur (localStorage). Jamais envoyées ailleurs qu’au service concerné.',
    omimKey: 'Clé OMIM',
    omimKeyHelp: 'Sans clé : phénotypes depuis Monarch (source libre). OMIM n’autorise pas les appels depuis une page web.',
    mobiKey: 'Clé MobiDetails',
    mobiKeyHelp: 'Sans clé : lien vers la page d’accueil MobiDetails.',
    save: 'Enregistrer',
    saved: 'Enregistré',
    clear: 'Effacer',
    gnomadForComment: 'Version gnomAD utilisée dans le commentaire',
    identity: 'Identité de la variation',
    gene: 'Gène',
    transcript: 'Transcrit',
    transcriptEns: 'Transcrit Ensembl',
    consequence: 'Conséquence',
    location: 'Localisation',
    exon: 'exon',
    intron: 'intron',
    hgvsc: 'HGVS c.',
    hgvscEns: 'HGVS c. (Ensembl)',
    hgvsp: 'HGVS p.',
    hgvsg: 'HGVS g.',
    pseudoVcf: 'pseudo-VCF hg38',
    nomenclature: 'Nomenclature complète',
    dbsnp: 'dbSNP',
    ensOther: 'autre transcrit : la numérotation c. n’est pas celle du transcrit retenu',
    copyHgvs: 'Copier c. p. g.',
    copyHgvsTitle: 'Copier les trois nomenclatures HGVS c., p. et g., une par ligne',
    copyValue: 'Copier {what}',
    mane: 'MANE Select',
    maneYes: 'oui',
    maneNo: 'non',
    maneIs: 'MANE Select : {tx}',
    // Épisignature Epi2Diag : voir js/episignatures.js. L'étiquette dit qu'une
    // épisignature existe pour ce gène, la note ce qu'on peut en faire aujourd'hui.
    epi: 'Épisignature Epi2Diag',
    epiTitle: 'Ce gène figure dans la liste des épisignatures suivies par le projet Epi2Diag',
    epiResearch: 'analyse de VSI possible au titre de la recherche',
    epiControls: 'analyse de VSI possible, témoins positifs complémentaires requis',
    epiWanted: 'témoins positifs nécessaires',
    epiControlsCount: '{n} témoins positifs',
    epiOneControl: '{n} témoin positif',
    epiSensitivity: 'sensibilité {s} %',
    epiInternal: 'validation interne',
    epiShared: 'signature partagée par quelques gènes',
    epiPerimeter: 'Périmètre : {p}',
    epiRegionUnknown: 'Deux signatures pour ce gène selon la position c. ; '
      + 'elle n’est pas déterminable ici, les deux sont donc affichées.',
    epiAsOf: 'liste Epi2Diag, {d}',
    epiClass45: 'Le projet recherche des échantillons de classe 4 ou 5 dans ce gène.',
    numbers: 'Chiffres',
    intervar: 'InterVar',
    clinvar: 'ClinVar',
    clinvarCount: '{n} soumission(s)',
    gnomad: 'gnomAD',
    version: 'Version',
    ac: 'AC',
    het: 'Hétérozygotes',
    hom: 'Homozygotes',
    freq: 'Fréquence',
    predictions: 'Prédictions',
    tool: 'Outil',
    verdict: 'Verdict',
    score: 'Score',
    del: 'délétère',
    tol: 'toléré',
    na: 'n.a.',
    conservation: 'Conservation',
    gerp: 'GERP++ RS',
    phylop: 'phyloP 100way',
    phastcons: 'phastCons 100way',
    conserved: 'conservé',
    notConserved: 'peu conservé',
    domain: 'Domaine protéique',
    phenotypes: 'Phénotypes',
    source: 'source',
    links: 'Liens',
    comment: 'Commentaire',
    copy: 'Copier',
    copied: 'Copié',
    regenerate: 'Régénérer',
    errSources: 'Sources indisponibles pour cette variation',
    errEmpty: 'Saisir une variation.',
    errUnknown: 'Saisie non reconnue. Attendu : NM_…:c.…, GÈNE:c.…, chr1:g.… '
      + 'ou chr-pos-ref-alt (hg38).',
    // Saisies qui ne nomment aucun transcrit : c'est le MANE Select qui est annoté,
    // et l'interface doit le dire — la nomenclature c. rendue est la sienne.
    transcriptFromGene: 'Aucun transcrit saisi : la position c. est comptée sur le transcrit '
      + 'MANE Select de {gene}, {tx}. Pour un autre transcrit, l’écrire devant la nomenclature.',
    transcriptFromGenomic: 'Aucun transcrit saisi : l’annotation porte sur le transcrit '
      + 'MANE Select {tx}.',
    geneRenamed: 'Symbole « {asked} » remplacé par {gene} (HGNC).',
    errGeneUnknown: 'Gène inconnu : « {gene} ». Vérifier le symbole (HGNC), ou saisir la '
      + 'nomenclature sur un transcrit — NM_…:c.…',
    errGeneNoMane: '{gene} n’a pas de transcrit MANE Select : saisir la nomenclature sur le '
      + 'transcrit voulu (NM_…:c.… ou NR_…:n.…).',
    errGeneSourcesDown: 'Le transcrit MANE Select de {gene} n’a pas pu être obtenu : HGNC et '
      + 'VariantValidator sont tous deux muets. Réessayer, ou saisir la nomenclature sur un '
      + 'transcrit — NM_…:c.…',
    errVep: 'VEP n’a pas pu normaliser cette variation : {msg}',
    errSourcesDown: 'Les deux services de normalisation sont momentanément indisponibles '
      + '(Ensembl VEP et VariantValidator). Aucune analyse n’est possible sans eux : '
      + 'réessayer dans quelques minutes. Détail : {msg}',
    errRejected: 'Cette variation n’a pas pu être validée : {msg}. Vérifier le transcrit, '
      + 'la position et la base de référence (génome hg38).',
    errNoMane: 'Aucun transcrit MANE à cette position : le service de repli n’y a rien à '
      + 'annoter, et la variation elle-même n’est pas en cause. Relancer quand Ensembl '
      + 'répond, ou saisir la variation en nomenclature HGVS sur le transcrit voulu — '
      + 'le repli l’accepte alors. ({msg})',
    errNetwork: 'Service Ensembl momentanément indisponible (il renvoie des erreurs par salves). Relancer l’analyse.',
    fallbackSource: 'Normalisation faite par {src} : Ensembl trop lent ou indisponible. Vérifier le transcrit et le type de variation.',
    fallbackSourceTyped: 'Normalisation faite par {src} : Ensembl trop lent ou indisponible. '
      + 'Le type de variation est établi sur la structure exonique du transcrit (UCSC) ; vérifier le transcrit.',
    degradedConsequence: 'Type de variation non déterminé par la source de repli : la phrase correspondante est omise du commentaire.',
    varTypeConfirmed: 'Type de variation confirmé par l’annotation gnomAD.',
    varTypeMismatch: 'Type de variation : « {mine} » ici, « {theirs} » d’après l’annotation gnomAD. Vérifier le transcrit et la position.',
    normSource: 'Source de normalisation',
    errGeneric: 'Échec de l’analyse : {msg}',
    notFound: 'Variation absente de MyVariant.info : les prédictions et ClinVar restent à « n.a. ».',
    noLinkData: 'données manquantes',
    missense_only: 'faux-sens uniquement',
    openAll: 'Ouvrir les liens principaux',
    discordantNote: 'valeurs discordantes selon le transcrit : {v}',
    pending: '…',
    pendingTitle: 'en attente de la source',
    phenotypesPending: 'Interrogation de Monarch…',
    commentPending: 'Le commentaire est rédigé quand toutes les sources ont répondu — '
      + 'une version partielle annoncerait des absences non vérifiées.\n\nEn attente de : {src}',
    waitingFor: 'en attente : {src}',
    /* Classification ACMG — voir js/acmg.js. L'encart rend les critères que les
     * chiffres étayent, chacun avec son fait et sa réserve, puis dit tout ce qu'il
     * ne peut pas étayer. Aucune classe n'y est calculée. */
    classShort: 'classe',
    acmg: 'Classification ACMG',
    acmgCopy: 'Copier les critères',
    acmgCopyTitle: 'Copier les critères étayés, un par ligne, avec le fait qui les porte',
    acmgSupportedTitle: 'Étayés par les chiffres',
    acmgNone: 'Aucun critère n’est étayé par les chiffres récupérés — ce qui ne veut pas '
      + 'dire qu’il n’y en a pas : voir ci-dessous.',
    acmgConditionalTitle: 'Suggérés par un chiffre, à trancher sur la maladie',
    acmgNoneFirm: 'Aucun critère n’est posé par un chiffre à lui seul.',
    acmgToSpecifyTitle: 'À préciser',
    acmgToSpecifyHelp: 'Ce qu’aucun chiffre récupéré ici ne peut poser — classé selon le '
      + 'plan du référentiel ANPGM. À cocher au vu du dossier.',
    // Plan du référentiel ANPGM / Réseau NGS-Diag (NGSDIAG_001 v2).
    acmgTopicPatientFreq: 'Données de fréquence des variants chez les patients',
    acmgTopicClinical: 'Critères cliniques',
    acmgTopicCooccurrence: 'Co-occurrence de variants',
    acmgTopicSegregation: 'Données de ségrégation',
    acmgTopicLength: 'Variation affectant la longueur de la protéine',
    acmgTopicTypeContext: 'Type et contexte de la variation',
    acmgTopicLocation: 'Localisation du variant',
    acmgTopicPredictions: 'Prédictions bio-informatiques',
    acmgTopicFunctional: 'Données fonctionnelles',
    acmgPredictionsCovered: 'Déjà étayées par l’application : les prédicteurs et SpliceAI '
      + 'sont interrogés à chaque analyse, et leur verdict est posé plus haut (PP3/BP4).',
    // Les critères à cocher, dans la langue du référentiel.
    acmgCritPS4: 'prévalence significativement plus élevée chez les patients que dans '
      + 'les témoins',
    acmgCritPP4: 'phénotype ou histoire familiale très spécifiques du gène',
    acmgCritBP5: 'autre cause moléculaire trouvée chez le patient',
    acmgCritPM3: 'en trans d’une variation pathogène, maladie récessive',
    acmgCritBP2: 'en trans d’une pathogène en dominant, ou en cis avec une pathogène',
    acmgCritPS2: 'de novo, ascendance confirmée',
    acmgCritPM6: 'de novo, ascendance non confirmée',
    acmgCritPP1: 'ségrégation avec la maladie dans la famille',
    acmgCritBS4: 'absence de ségrégation dans la famille',
    acmgCritBP3: 'variation sans décalage du cadre dans une région répétée, hors domaine '
      + 'fonctionnel',
    acmgCritPP2: 'faux-sens dans un gène où ils sont rares et un mécanisme connu de la '
      + 'maladie',
    acmgCritBP1: 'faux-sens dans un gène où seules les troncatures sont pathogènes',
    acmgCritPS1: 'même changement d’acide aminé qu’une variation pathogène connue',
    acmgCritPM5: 'autre changement pathogène connu au même acide aminé',
    acmgCritPS3: 'étude fonctionnelle montrant un effet délétère',
    acmgCritBS3: 'étude fonctionnelle ne montrant aucun effet',
    acmgControlTitle: 'Contrôle automatique',
    acmgNoVerdict: 'Aucune classe n’est calculée ici : pondérer ces critères demande la '
      + 'spécification du gène (VCEP ClinGen s’il en existe une), le mécanisme de la '
      + 'maladie et le contexte du patient. La classe reste celle que vous posez.',
    acmgRefIntro: 'Référentiel français pour la pondération et la classification : ',
    acmgRefLabel: 'ANPGM / Réseau NGS-Diag — Interprétation des variants '
      + '(NGSDIAG_001, version 2, 2021)',
    acmgNoPp5: 'PP5 et BP6 ne sont jamais posés ici : ClinGen les a retirés en 2018, parce '
      + 'qu’ils reclassent ClinVar avec ClinVar. InterVar, lui, les pose encore — d’où un '
      + 'verdict parfois plus tranché que les critères ci-dessus. La soumission ClinVar se '
      + 'lit à sa ligne, dans les chiffres.',
    acmgIntervarNote: 'InterVar ne traite que les substitutions : sur un indel, il ne '
      + 'rend rien.',
    // Les faits qui portent un critère.
    acmgWhyStartLost: 'perte du codon d’initiation',
    acmgWhyDomain: 'domaine InterPro : {d}',
    acmgWhyAbsent: 'absente de gnomAD {v}',
    acmgWhyAc0: 'AC 0 dans gnomAD {v}',
    acmgWhyFreq: 'fréquence {f} dans gnomAD {v}',
    acmgWhyHom: '{n} homozygotes dans gnomAD {v}, maladie récessive',
    acmgWhyDel: 'délétère pour {list}',
    acmgWhyTol: 'toléré pour {list}',
    acmgWhySilent: '{type}, SpliceAI {s}, GERP {g}',
    acmgSkipOfOne: 'de l’exon {n}',
    acmgSkipOfMany: 'des exons {list}',
    acmgSkipInFrame: 'saut {ex} en phase',
    acmgSkipOutFrame: 'saut {ex} hors phase',
    acmgSkipCarries: 'saut {ex} emportant {what}',
    // Les réserves qui restent, critère par critère.
    acmgNotePVS1: 'sous réserve que la perte de fonction soit un mécanisme établi de ce '
      + 'gène, et de l’arbre de décision PVS1 (NMD, dernier exon, site alternatif)',
    acmgNoteStartLost: 'ramené à « modéré » par ClinGen SVI : un ATG en aval peut '
      + 'reprendre la lecture',
    acmgNotePM1: 'point chaud mutationnel et absence de variation bénigne dans le '
      + 'domaine : non vérifiés ici',
    acmgNotePM2: 'ramené à « supporting » par ClinGen SVI ; sur une maladie récessive, '
      + 'c’est une fréquence basse qui compte, pas l’absence',
    acmgNotePM4: 'hors région répétée : non vérifié ici',
    acmgNoteBA1: 'BA1 se juge sur une population précise, et c’est ici la fréquence '
      + 'globale ; ClinGen tient une liste d’exceptions par gène',
    acmgNoteBS1: 'le seuil dépend de la maladie (prévalence, pénétrance, hétérogénéité) : '
      + '1 % n’est qu’une convention',
    acmgNoteBS2: 'gnomAD écarte les maladies pédiatriques sévères mais n’est pas '
      + 'phénotypé : sur une maladie fréquente ou compatible avec l’âge adulte, ces '
      + 'homozygotes peuvent être des patients',
    acmgNotePred: 'la force se lit sur un prédicteur calibré et ses seuils (REVEL, '
      + 'BayesDel), pas sur le décompte des outils',
    acmgNoteBP7: 'BP7 ne couvre pas une base de bordure d’exon : la position dans l’exon '
      + 'se lit sous « Structure exonique »',
    structure: 'Structure exonique',
    schemaGene: 'Transcrit',
    schemaZoom: 'Zoom sur la jonction la plus proche',
    schemaScaleNote: 'Exons à l’échelle compressée (racine carrée) et introns hors échelle : '
      + 'dans cette vue, seule la position de la variation à l’intérieur de son exon est '
      + 'proportionnelle. Le zoom, lui, est à l’échelle de la paire de bases.',
    schemaGeneAlt: 'Schéma de {gene} : {n} exons, avec la position de la variation.',
    schemaZoomAlt: 'Zoom à l’échelle de la base, sur {n} pb autour de la variation.',
    schemaDonor: 'exon {n} / intron {n}',
    schemaAcceptor: 'intron {p} / exon {n}',
    schemaVariant: 'variation',
    // La variation posée sur la jonction : une seule étiquette pour un seul repère.
    schemaVariantOn: 'variation — {j}',
    schemaOnJunction: 'jonction',
    bpShort: '{n} pb',
    siteDonor: 'donneur',
    siteAcceptor: 'accepteur',
    structPos: 'Position',
    structPosExon: 'exon {n}/{total} — {len} pb, base {i} de l’exon',
    structPosIntron: 'intron {n}/{total} — {len} pb',
    structPosJunction: 'à cheval sur une jonction de l’exon {n}/{total}',
    structDonor: 'Site donneur (3′)',
    structAcceptor: 'Site accepteur (5′)',
    structEdge: 'Bordure exonique',
    structSpliceSite: 'Site d’épissage',
    structFirstExon: 'premier exon : pas de jonction en 5′',
    structLastExon: 'dernier exon : pas de jonction en 3′',
    edgeExonOn: 'oui — sur la base de bordure elle-même, côté {site}',
    edgeExonEdge: 'oui — à {n} pb du site {site} (bases 1 à 3 de l’exon)',
    edgeExonNear: 'non, mais proche — à {n} pb du site {site}',
    edgeExonInside: 'non — jonction la plus proche à {n} pb (site {site})',
    edgeExonOnly: 'exon unique : aucune jonction d’épissage',
    edgeIntronCanonical: 'site {site} canonique ({sign}{n})',
    edgeIntronSplice: 'région d’épissage intronique ({sign}{n})',
    edgeIntronDeep: 'intron profond — à {n} pb du site {site}',
    edgeJunctionOn: 'la variation emporte la jonction elle-même',
    structHelp: 'Bordure exonique = les 3 premières ou 3 dernières bases de l’exon, '
      + 'définition de splice_region_variant chez VEP ; site canonique = ±1 et ±2 dans '
      + 'l’intron. Structure exonique RefSeq lue sur l’API UCSC (hg38).',
    structMismatch: 'Désaccord de numérotation : la normalisation annonce {expected}, la '
      + 'structure RefSeq donne {got}. Les distances ci-dessous sont celles de la structure.',
    structVersion: 'Structure lue sur {tx} : UCSC ne sert que la version courante du '
      + 'transcrit, et les bornes d’exons peuvent différer de celles de la version saisie.',
    structPending: 'Lecture de la structure exonique…',
    structNone: 'Structure exonique indisponible pour ce transcrit.',
    structOutside: 'La variation tombe hors du transcrit : aucune jonction à mesurer.',
    // Saut d'exon : la phase de l'exon dont le site est mis en cause (voir
    // exonSkipping, js/structure.js). Les verbes sont au conditionnel — le saut est
    // l'hypothèse de référence, pas un fait vérifié.
    structSkip: 'Saut d’exon',
    skipExonOne: 'l’exon {n}',
    skipExonMany: 'les exons {list}',
    skipSite: 'site {site}',
    skipCodingBp: '{n} pb codantes',
    skipAaOne: '{n} acide aminé',
    skipAaMany: '{n} acides aminés',
    skipInFrame: 'en phase — le saut de {ex} ({ctx}) retirerait {aa} sans décaler le '
      + 'cadre de lecture',
    skipOutFrame: 'hors phase — le saut de {ex} ({ctx}) décalerait le cadre de lecture',
    skipCarries: 'le saut de {ex} ({ctx}) emporterait {what} : la phase ne dit pas la '
      + 'conséquence',
    skipAtg: 'le codon d’initiation',
    skipStopCodon: 'le codon stop',
    skipAnd: ' et ',
    skipNoncoding: '{ex} ({ctx}) ne contient aucune base codante : le cadre de lecture '
      + 'n’est pas en cause',
    skipHelp: 'Saut d’exon : conséquence de référence d’une variation d’épissage, non '
      + 'vérifiée ici — une rétention d’intron ou l’usage d’un site cryptique en '
      + 'produiraient une autre. L’exon est dit en phase quand sa part codante est un '
      + 'multiple de 3. Sur le schéma du transcrit, il est encadré en pointillés.',
  },
  en: {
    tagline: 'Variant annotation and report comment — web version of the SNV ToolBox',
    inputLabel: 'Variant',
    inputPlaceholder: 'NM_000546.6:c.524G>A   or   chr17-7675088-C-T',
    inputHelp: 'HGVS on a RefSeq transcript, GENE:c.… or hg38 genomic HGVS (MANE Select '
      + 'transcript), or hg38 pseudo-VCF (chr-pos-ref-alt)',
    classLabel: 'Reported class',
    analyse: 'Analyse',
    analysing: 'Analysing…',
    progressNormalising: 'Normalising the variant… ({s} s)',
    progressFallback: 'Ensembl is slow to answer — falling back to VariantValidator… ({s} s)',
    progressFallbackFailed: 'VariantValidator unavailable — giving Ensembl its last '
      + 'chance… ({s} s)',
    progressAnnotating: 'Querying the databases… ({s} s)',
    errTimeout: 'Timed out: no source answered. Run the analysis again.',
    settings: 'API keys',
    settingsHelp: 'Stored in this browser only (localStorage). Never sent anywhere but the service itself.',
    omimKey: 'OMIM key',
    omimKeyHelp: 'Without a key: phenotypes from Monarch (open source). OMIM does not allow calls from a web page.',
    mobiKey: 'MobiDetails key',
    mobiKeyHelp: 'Without a key: link to the MobiDetails home page.',
    save: 'Save',
    saved: 'Saved',
    clear: 'Clear',
    gnomadForComment: 'gnomAD version used in the comment',
    identity: 'Variant identity',
    gene: 'Gene',
    transcript: 'Transcript',
    transcriptEns: 'Ensembl transcript',
    consequence: 'Consequence',
    location: 'Location',
    exon: 'exon',
    intron: 'intron',
    hgvsc: 'HGVS c.',
    hgvscEns: 'HGVS c. (Ensembl)',
    hgvsp: 'HGVS p.',
    hgvsg: 'HGVS g.',
    pseudoVcf: 'hg38 pseudo-VCF',
    nomenclature: 'Full nomenclature',
    dbsnp: 'dbSNP',
    ensOther: 'different transcript: the c. numbering is not that of the selected transcript',
    copyHgvs: 'Copy c. p. g.',
    copyHgvsTitle: 'Copy the three HGVS c., p. and g. nomenclatures, one per line',
    copyValue: 'Copy {what}',
    mane: 'MANE Select',
    maneYes: 'yes',
    maneNo: 'no',
    maneIs: 'MANE Select: {tx}',
    epi: 'Epi2Diag episignature',
    epiTitle: 'This gene is on the list of episignatures tracked by the Epi2Diag project',
    epiResearch: 'VUS analysis available as research',
    epiControls: 'VUS analysis available, further positive controls needed',
    epiWanted: 'positive controls needed',
    epiControlsCount: '{n} positive controls',
    epiOneControl: '{n} positive control',
    epiSensitivity: '{s}% sensitivity',
    epiInternal: 'internal validation',
    epiShared: 'signature shared by a few genes',
    epiPerimeter: 'Perimeter: {p}',
    epiRegionUnknown: 'Two signatures for this gene depending on the c. position; '
      + 'it cannot be determined here, so both are shown.',
    epiAsOf: 'Epi2Diag list, {d}',
    epiClass45: 'The project is seeking class 4 or 5 samples in this gene.',
    numbers: 'Numbers',
    intervar: 'InterVar',
    clinvar: 'ClinVar',
    clinvarCount: '{n} submission(s)',
    gnomad: 'gnomAD',
    version: 'Version',
    ac: 'AC',
    het: 'Heterozygotes',
    hom: 'Homozygotes',
    freq: 'Frequency',
    predictions: 'Predictions',
    tool: 'Tool',
    verdict: 'Verdict',
    score: 'Score',
    del: 'deleterious',
    tol: 'tolerated',
    na: 'n.a.',
    conservation: 'Conservation',
    gerp: 'GERP++ RS',
    phylop: 'phyloP 100way',
    phastcons: 'phastCons 100way',
    conserved: 'conserved',
    notConserved: 'poorly conserved',
    domain: 'Protein domain',
    phenotypes: 'Phenotypes',
    source: 'source',
    links: 'Links',
    comment: 'Comment',
    copy: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    errSources: 'Sources unavailable for this variant',
    errEmpty: 'Enter a variant.',
    errUnknown: 'Input not recognised. Expected: NM_…:c.…, GENE:c.…, chr1:g.… '
      + 'or chr-pos-ref-alt (hg38).',
    transcriptFromGene: 'No transcript entered: the c. position is counted on the MANE Select '
      + 'transcript of {gene}, {tx}. For another transcript, write it before the nomenclature.',
    transcriptFromGenomic: 'No transcript entered: the annotation is on the MANE Select '
      + 'transcript {tx}.',
    geneRenamed: 'Symbol "{asked}" replaced with {gene} (HGNC).',
    errGeneUnknown: 'Unknown gene: "{gene}". Check the symbol (HGNC), or enter the '
      + 'nomenclature on a transcript — NM_…:c.…',
    errGeneNoMane: '{gene} has no MANE Select transcript: enter the nomenclature on the '
      + 'transcript you want (NM_…:c.… or NR_…:n.…).',
    errGeneSourcesDown: 'The MANE Select transcript of {gene} could not be obtained: HGNC and '
      + 'VariantValidator are both silent. Try again, or enter the nomenclature on a '
      + 'transcript — NM_…:c.…',
    errVep: 'VEP could not normalise this variant: {msg}',
    errSourcesDown: 'Both normalisation services are briefly unavailable '
      + '(Ensembl VEP and VariantValidator). No analysis is possible without them: '
      + 'try again in a few minutes. Detail: {msg}',
    errRejected: 'This variant could not be validated: {msg}. Check the transcript, '
      + 'the position and the reference base (hg38 genome).',
    errNoMane: 'No MANE transcript at this position: the fallback service has nothing to '
      + 'annotate here, and the variant itself is not at fault. Run the analysis again '
      + 'once Ensembl answers, or enter the variant as HGVS on the transcript you want — '
      + 'the fallback then accepts it. ({msg})',
    errNetwork: 'The Ensembl service is briefly unavailable (it returns errors in bursts). Run the analysis again.',
    fallbackSource: 'Normalisation done by {src}: Ensembl too slow or unavailable. Check the transcript and the variant type.',
    fallbackSourceTyped: 'Normalisation done by {src}: Ensembl too slow or unavailable. '
      + 'The variant type is established from the exon structure of the transcript (UCSC); check the transcript.',
    degradedConsequence: 'The fallback source could not determine the variant type: that sentence is omitted from the comment.',
    varTypeConfirmed: 'Variant type confirmed by the gnomAD annotation.',
    varTypeMismatch: 'Variant type: "{mine}" here, "{theirs}" according to the gnomAD annotation. Check the transcript and the position.',
    normSource: 'Normalisation source',
    errGeneric: 'Analysis failed: {msg}',
    notFound: 'Variant absent from MyVariant.info: predictions and ClinVar stay at "n.a.".',
    noLinkData: 'missing data',
    missense_only: 'missense only',
    openAll: 'Open the main links',
    discordantNote: 'values differ between transcripts: {v}',
    pending: '…',
    pendingTitle: 'waiting for the source',
    phenotypesPending: 'Querying Monarch…',
    commentPending: 'The comment is written once every source has answered — '
      + 'a partial version would state absences that have not been checked.\n\nWaiting for: {src}',
    waitingFor: 'waiting: {src}',
    classShort: 'class',
    acmg: 'ACMG classification',
    acmgCopy: 'Copy the criteria',
    acmgCopyTitle: 'Copy the supported criteria, one per line, with the fact behind each',
    acmgSupportedTitle: 'Supported by the figures',
    acmgNone: 'No criterion is supported by the figures retrieved — which does not mean '
      + 'there is none: see below.',
    acmgConditionalTitle: 'Suggested by a figure, to be settled against the disease',
    acmgNoneFirm: 'No criterion is set by a figure on its own.',
    acmgToSpecifyTitle: 'To be specified',
    acmgToSpecifyHelp: 'What no figure retrieved here can set — ordered after the ANPGM '
      + 'reference document. To be ticked against the case file.',
    acmgTopicPatientFreq: 'Variant frequency in patients',
    acmgTopicClinical: 'Clinical criteria',
    acmgTopicCooccurrence: 'Co-occurrence of variants',
    acmgTopicSegregation: 'Segregation data',
    acmgTopicLength: 'Variant affecting protein length',
    acmgTopicTypeContext: 'Type and context of the variant',
    acmgTopicLocation: 'Location of the variant',
    acmgTopicPredictions: 'In silico predictions',
    acmgTopicFunctional: 'Functional data',
    acmgPredictionsCovered: 'Already supported by the application: the predictors and '
      + 'SpliceAI are queried on every analysis, and their verdict is set above (PP3/BP4).',
    acmgCritPS4: 'prevalence significantly higher in patients than in controls',
    acmgCritPP4: 'phenotype or family history highly specific to the gene',
    acmgCritBP5: 'alternate molecular cause found in the patient',
    acmgCritPM3: 'in trans with a pathogenic variant, recessive disease',
    acmgCritBP2: 'in trans with a pathogenic variant in a dominant gene, or in cis with one',
    acmgCritPS2: 'de novo, parentage confirmed',
    acmgCritPM6: 'de novo, parentage not confirmed',
    acmgCritPP1: 'cosegregation with disease in the family',
    acmgCritBS4: 'lack of segregation in the family',
    acmgCritBP3: 'in-frame variant in a repeat region, outside a functional domain',
    acmgCritPP2: 'missense in a gene where they are rare and a known disease mechanism',
    acmgCritBP1: 'missense in a gene where only truncating variants are pathogenic',
    acmgCritPS1: 'same amino acid change as a known pathogenic variant',
    acmgCritPM5: 'another pathogenic change known at the same amino acid',
    acmgCritPS3: 'functional study showing a deleterious effect',
    acmgCritBS3: 'functional study showing no effect',
    acmgControlTitle: 'Automated control',
    acmgNoVerdict: 'No class is computed here: weighting these criteria requires the '
      + 'gene specification (a ClinGen VCEP where one exists), the disease mechanism and '
      + 'the patient context. The class stays the one you set.',
    acmgRefIntro: 'French reference for weighting and classification: ',
    acmgRefLabel: 'ANPGM / Réseau NGS-Diag — Interprétation des variants '
      + '(NGSDIAG_001, version 2, 2021, in French)',
    acmgNoPp5: 'PP5 and BP6 are never set here: ClinGen retired them in 2018, because they '
      + 'reclassify ClinVar with ClinVar. InterVar still sets them — hence a verdict '
      + 'sometimes firmer than the criteria above. The ClinVar submission is on its own '
      + 'line, in the figures.',
    acmgIntervarNote: 'InterVar only handles substitutions: on an indel it returns '
      + 'nothing.',
    acmgWhyStartLost: 'initiation codon lost',
    acmgWhyDomain: 'InterPro domain: {d}',
    acmgWhyAbsent: 'absent from gnomAD {v}',
    acmgWhyAc0: 'AC 0 in gnomAD {v}',
    acmgWhyFreq: 'frequency {f} in gnomAD {v}',
    acmgWhyHom: '{n} homozygotes in gnomAD {v}, recessive disease',
    acmgWhyDel: 'deleterious for {list}',
    acmgWhyTol: 'tolerated for {list}',
    acmgWhySilent: '{type}, SpliceAI {s}, GERP {g}',
    acmgSkipOfOne: 'of exon {n}',
    acmgSkipOfMany: 'of exons {list}',
    acmgSkipInFrame: 'skip {ex} in frame',
    acmgSkipOutFrame: 'skip {ex} out of frame',
    acmgSkipCarries: 'skip {ex} carrying {what}',
    acmgNotePVS1: 'provided loss of function is an established mechanism for this gene, '
      + 'and subject to the PVS1 decision tree (NMD, last exon, alternative site)',
    acmgNoteStartLost: 'downgraded to moderate by ClinGen SVI: a downstream ATG may take '
      + 'over translation',
    acmgNotePM1: 'mutational hot spot and absence of benign variation in the domain: not '
      + 'checked here',
    acmgNotePM2: 'downgraded to supporting by ClinGen SVI; for a recessive disease what '
      + 'counts is a low frequency, not absence',
    acmgNotePM4: 'outside a repeat region: not checked here',
    acmgNoteBA1: 'BA1 is judged on a specific population, and this is the global '
      + 'frequency; ClinGen maintains a per-gene exception list',
    acmgNoteBS1: 'the threshold depends on the disease (prevalence, penetrance, '
      + 'heterogeneity): 1 % is only a convention',
    acmgNoteBS2: 'gnomAD screens out severe paediatric disease but is not phenotyped: in a '
      + 'common disease, or one compatible with adulthood, those homozygotes may be '
      + 'patients',
    acmgNotePred: 'strength comes from one calibrated predictor and its thresholds '
      + '(REVEL, BayesDel), not from counting tools',
    acmgNoteBP7: 'BP7 does not cover a base at an exon border: the position within the '
      + 'exon is shown under "Exon structure"',
    structure: 'Exon structure',
    schemaGene: 'Transcript',
    schemaZoom: 'Zoom on the nearest junction',
    schemaScaleNote: 'Exon lengths on a compressed (square-root) scale and introns not to '
      + 'scale: in this view only the position of the variant inside its own exon is '
      + 'proportional. The zoom below is at base-pair scale.',
    schemaGeneAlt: 'Diagram of {gene}: {n} exons, with the position of the variant.',
    schemaZoomAlt: 'Base-scale zoom over {n} bp around the variant.',
    schemaDonor: 'exon {n} / intron {n}',
    schemaAcceptor: 'intron {p} / exon {n}',
    schemaVariant: 'variant',
    schemaVariantOn: 'variant — {j}',
    schemaOnJunction: 'junction',
    bpShort: '{n} bp',
    siteDonor: 'donor',
    siteAcceptor: 'acceptor',
    structPos: 'Position',
    structPosExon: 'exon {n}/{total} — {len} bp, base {i} of the exon',
    structPosIntron: 'intron {n}/{total} — {len} bp',
    structPosJunction: 'straddling a junction of exon {n}/{total}',
    structDonor: 'Donor site (3′)',
    structAcceptor: 'Acceptor site (5′)',
    structEdge: 'At an exon border',
    structSpliceSite: 'Splice site',
    structFirstExon: 'first exon: no junction at the 5′ end',
    structLastExon: 'last exon: no junction at the 3′ end',
    edgeExonOn: 'yes — on the border base itself, {site} side',
    edgeExonEdge: 'yes — {n} bp from the {site} site (bases 1 to 3 of the exon)',
    edgeExonNear: 'no, but close — {n} bp from the {site} site',
    edgeExonInside: 'no — nearest junction {n} bp away ({site} site)',
    edgeExonOnly: 'single-exon transcript: no splice junction',
    edgeIntronCanonical: 'canonical {site} site ({sign}{n})',
    edgeIntronSplice: 'intronic splice region ({sign}{n})',
    edgeIntronDeep: 'deep intronic — {n} bp from the {site} site',
    edgeJunctionOn: 'the variant removes the junction itself',
    structHelp: 'An exon border means the first or last 3 bases of the exon, the definition '
      + 'of splice_region_variant in VEP; a canonical site means ±1 and ±2 inside the '
      + 'intron. RefSeq exon structure read from the UCSC API (hg38).',
    structMismatch: 'Numbering disagreement: normalisation reports {expected}, the RefSeq '
      + 'structure gives {got}. The distances below come from the structure.',
    structVersion: 'Structure read from {tx}: UCSC only serves the current version of a '
      + 'transcript, and exon boundaries may differ from the version you entered.',
    structPending: 'Reading the exon structure…',
    structNone: 'No exon structure available for this transcript.',
    structOutside: 'The variant falls outside the transcript: no junction to measure.',
    structSkip: 'Exon skipping',
    skipExonOne: 'exon {n}',
    skipExonMany: 'exons {list}',
    skipSite: '{site} site',
    skipCodingBp: '{n} coding bp',
    skipAaOne: '{n} amino acid',
    skipAaMany: '{n} amino acids',
    skipInFrame: 'in frame — skipping {ex} ({ctx}) would remove {aa} without shifting '
      + 'the reading frame',
    skipOutFrame: 'out of frame — skipping {ex} ({ctx}) would shift the reading frame',
    skipCarries: 'skipping {ex} ({ctx}) would remove {what}: the frame does not '
      + 'describe the consequence',
    skipAtg: 'the initiation codon',
    skipStopCodon: 'the stop codon',
    skipAnd: ' and ',
    skipNoncoding: '{ex} ({ctx}) contains no coding base: the reading frame is not at stake',
    skipHelp: 'Exon skipping is the reference consequence of a splice variant, and is '
      + 'not verified here — intron retention or the use of a cryptic site would '
      + 'produce another. An exon is in frame when its coding length is a multiple of '
      + '3. It is outlined with a dashed box in the transcript diagram.',
  },
};

export function t(lang, key, vars = {}) {
  const s = (UI[lang] && UI[lang][key]) || (UI.fr[key] || key);
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])));
}

/** Langue initiale : choix mémorisé, sinon langue du navigateur, sinon français. */
export function initialLang() {
  try {
    const saved = localStorage.getItem('vt.lang');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch (e) { /* localStorage indisponible */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')) || '';
  return /^fr/i.test(nav) ? 'fr' : 'en';
}
