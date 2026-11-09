# variant-toolbox — version web de la ToolBox SNV (spécification)

Décidé le 09/11/2026. Dépôt : **`JiMouse/variant-toolbox`** (GitHub Pages, contributeur unique). Source : `UserFormTool`, `Annotation.LoadAnnotation`, `comment.GetComment`, `Liens` de `MacroCES_Web.xlsm`.

## Principe
- Page statique (HTML + JavaScript, sans étape de build), hébergée sur GitHub Pages. Aucun serveur : seuls les services appelables depuis un navigateur (CORS) donnent des chiffres ; les autres deviennent un lien et la valeur affichée est « n.a. ».
- Bilingue FR / EN : langue détectée depuis le navigateur, bouton FR/EN, choix mémorisé (localStorage). Le commentaire suit la langue de l'interface ; en anglais, équivalent de la phrase HAS pour la classe 3.
- **Entrée** : HGVS (`NM_…:c.…`) ou pseudo-VCF hg38 (`chr-pos-ref-alt`) + classe du biologiste (3 / 4 / 5).
- **Transcrit** : entrée VCF → MANE Select ; entrée HGVS → transcrit saisi, avec indication MANE oui/non.

## Clés API (stockées dans le navigateur uniquement, localStorage, jamais dans le dépôt)
- **OMIM** : si clé saisie → phénotypes + transmission depuis l'API OMIM ; sinon → source libre (Orphanet / Monarch gene–disease avec mode de transmission).
- **MobiDetails** : si clé saisie → création/lecture de l'ID et lien vers la fiche du variant ; sinon → lien vers la page d'accueil MobiDetails.
- ⚠️ La clé MobiDetails est actuellement écrite en dur dans `ToolBox.GetMobiId` (VBA). Ne pas la reprendre dans le dépôt public.

## Sources de données (remplacent les colonnes SOPHiA lues par la macro)
| Donnée | Source |
|---|---|
| Gène, transcrit, conséquence, exon/intron, HGVS c./p./g. | Ensembl VEP REST (refseq=1) |
| gnomAD **v4.1 exomes + génomes** (AC, homozygotes, AF) | API GraphQL gnomAD |
| gnomAD **v2.1.1 exomes** (si possible, comme la macro) | MyVariant.info (`gnomad_exome`) |
| SIFT, PolyPhen-2, AlphaMissense, REVEL, MetaLR, GERP++, phyloP100way, phastCons100way, InterPro | MyVariant.info (`dbnsfp`) |
| CADD phred | MyVariant.info (ou API CADD GRCh38-v1.6) |
| SpliceAI | spliceailookup-api.broadinstitute.org (hg=38) |
| ClinVar signification + accessions RCV | MyVariant.info (`clinvar`) |
| InterVar | wintervar API (lien seul si CORS bloqué) |
| UniProt, HGNC (ClinGen) | mygene.info |
| NCBI GeneID (PubTator), MANE | NCBI E-utilities |

## Chiffres affichés (= UserForm)
InterVar ; ClinVar (nb de soumissions + accessions) ; gnomAD hétérozygotes / homozygotes / fréquence ; SIFT, PolyPhen-2, AlphaMissense, CADD, REVEL, MetaLR, SpliceAI ; GERP, PhyloP, phastCons ; domaine protéique.
Seuils de la macro : CADD > 15, REVEL > 0,5, SpliceAI > 0,5, GERP ≥ 2 = conservé, AlphaMissense pred B = toléré ; SIFT/PolyPhen/MetaLR : T/B = toléré, D/P/A = délétère. Vert = toléré, rouge = délétère.

## Liens (= boutons du UserForm + liens cachés)
OMIM, Decipher (`/sequence-variant/<vcf>/genes/<gène>/protein-genomic-info`), UniProt (`#family_and_domains`), PubMed (`"gène"[tiab] AND (variant OR mutation OR mutant) NOT (somatic OR tumour)`), PubTator (`@gene@<GeneID>`), ClinGen (`HGNC:`), gnomAD (r4 + r2_1), dbSNP, LitVar2, UCSC (genome-euro, hg38, ±250 pb, sessions `JeanMarieRavel/SNV_hg38` et `DesignPCR_hg38`), LOVD, MobiDetails, Mastermind, Varsome (`/variant/hg38/<vcf>`), Franklin (`<vcf>-hg38?app=assessment-tools`), Orphanet (`/fr/disease/gene/<gène>`), ClinVar, InterVar, CADD, VEP, VEP-splice, PanelApp, MANE (nuccore).

## Commentaire (même ordre que `GetComment`)
1. Nomenclature
2. « Il s'agit d'une [type]. Elle est localisée au niveau de l'[exon|intron] [n] ([n/total]) du gène [X]. » (faux-sens, non-sens, frameshift, synonyme, intronique, inframe, site accepteur/donneur)
3. Fréquence : absente de gnomAD (AC = 0 ou n.a.) / rare (AC ≤ 5) / présente (version, fréq.)
4. Prédictions : pathogène si délétères > tolérés ET REVEL/MetaLR concordants et au moins un délétère ; bénin à l'inverse ; sinon discordant (listes délétère / toléré)
5. Variation nulle (frameshift, non-sens, splice ±1/2) → « La perte de fonction est un mécanisme connu de pathogénicité de ce gène. »
6. Conservation (faux-sens) : GERP conservé ET phyloP > 4
7. Domaine InterPro
8. ClinVar : signification traduite + accessions
9. Phénotypes OMIM : « [phénotype] (MIM #…) de transmission [AD/AR/XLR/XLD traduits]. »
10. Conclusion selon la classe 3 / 4 / 5 (textes identiques à la macro)

**Bug de la macro corrigé dans la version web** : la phrase de conservation n'apparaît jamais (`var_type = "missense"` est testé après remplacement par « variation faux-sens »), et produit « résidu  au cours de l'évolution » si non conservé.

## Environnement de travail
- L'espace de travail cloud du chat claude.ai bloque les appels réseau vers les API génomiques (MyVariant, Ensembl, gnomAD) et n'a pas de compte GitHub relié → développement prévu dans **Claude Code** sur le poste, avec le dépôt cloné.

## À faire
- [x] Créer le dépôt public vide `JiMouse/variant-toolbox` et activer GitHub Pages (branche `main`, racine).
- [x] Tester le CORS de chaque service ; lister ceux qui passent en « lien seul ». → `docs/cors.md`
- [x] Construire : saisie + normalisation (VEP) → chiffres → liens → commentaire FR/EN.
- [x] Valider. La comparaison avec les commentaires de la macro a été écartée : la
      vérification repose sur 53 contrôles hors réseau et neuf variants réels, un par
      branche de `GetComment`. → `docs/validation.md`
