# Ensembl : quel endpoint, et quelles solutions de repli

Écrit après une panne observée le 09/11/2026 : `rest.ensembl.org` a renvoyé des `500`
sur toutes ses requêtes pendant une quinzaine de minutes (alors que `/info/ping`
répondait `200`), rendant l'application inutilisable.

## 1. L'endpoint utilisé était le mauvais

Mesure par échantillons **entrelacés** (14 tours, un appel de chaque type par tour,
pour que les salves d'erreurs ne favorisent aucun endpoint) :

| Endpoint | Réussis | Erreurs |
|---|---|---|
| `GET /vep/human/region/{region}/{allele}` | **6 / 14** | 7 × `500`, 1 timeout |
| `GET /vep/human/hgvs/{hgvs génomique}` | **14 / 14** | — |
| `GET /vep/human/hgvs/{hgvs transcrit}` | **14 / 14** | — |
| `GET /sequence/region/human/{région}` | **14 / 14** | — |

`/vep/human/region` échoue donc **plus d'une fois sur deux**, alors que
`/vep/human/hgvs` est stable — y compris avec un **HGVS génomique**
(`17:g.7675088C>T`), qui porte exactement la même information.

**Correction** : une saisie pseudo-VCF est convertie en HGVS génomique et envoyée à
`/vep/human/hgvs`. Les deux formes de saisie passent maintenant par un seul endpoint,
le fiable. Deux bénéfices en plus :

- pour une entrée génomique VEP renvoie `strand: 1` et des allèles déjà dans
  l'orientation du génome — plus de complémentation à faire ;
- le `POST /vep/human/region` était de toute façon inutilisable depuis un
  navigateur (son `OPTIONS` ne renvoie aucun en-tête CORS).

À noter : `POST /vep/human/hgvs` **répond** correctement au préflight CORS. Il reste
une piste si un jour il faut traiter plusieurs variants en un appel.

## 2. Alternatives testées

Toutes testées avec un en-tête `Origin: https://jimouse.github.io`.

| Service | CORS | Utilisable ? |
|---|---|---|
| **VariantValidator** (`rest.variantvalidator.org`) | `*` | ✅ **repli complet**, voir ci-dessous |
| **UCSC** (`api.genome.ucsc.edu`) | `*` | ✅ repli pour la séquence de référence |
| **NCBI Variation Services** (`api.ncbi.nlm.nih.gov/variation/v0`) | reflète l'origine | ✅ normalisation HGVS → SPDI (non utilisé : VariantValidator fait plus) |
| **GeneBe** (`api.genebe.net`) | *aucun* (`403 Invalid CORS request`) | ❌ refuse les origines non autorisées |
| `grch37.rest.ensembl.org` | `*` | ❌ même infrastructure, et GRCh37 |

### VariantValidator comme repli

Il fournit tout ce dont dépend la chaîne, sauf le terme de conséquence :

| Donnée | Champ |
|---|---|
| gène, transcrit | `gene_symbol`, `hgvs_transcript_variant` |
| HGVS c. / p. / g. | `hgvs_transcript_variant`, `hgvs_predicted_protein_consequence.tlr`, `primary_assembly_loci.grch38.hgvs_genomic_description` |
| **coordonnées VCF normalisées** | `primary_assembly_loci.grch38.vcf` |
| MANE Select | `annotations.mane_select` |
| numéro d'exon / intron | `variant_exonic_positions` (suffixe `i` = intron) |
| nombre total d'exons | `tools/gene2transcripts` → `genomic_spans[].exon_structure` |
| HGNC, NCBI GeneID | `annotations.db_xref` |

La **conséquence** est déduite des nomenclatures (`inferConsequence`), de façon
prudente : motif non reconnu → `null`, et la phrase de type est **omise** du
commentaire plutôt que risquer un type faux. L'interface affiche alors la source de
repli et invite à vérifier le transcrit et le type.

Le repli s'enclenche automatiquement quand VEP échoue. Vérifié en coupant
`rest.ensembl.org` (18 requêtes refusées) : sortie **identique** à celle de VEP sur
TP53 `c.524G>A`, CFTR `p.Phe508del` et BRCA1 `c.5467+1G>A` — même transcrit, même
indicateur MANE, mêmes exon/intron `5/11`, `11/27`, `22/22`, mêmes coordonnées VCF.
Chaîne complète sous panne simulée : tous les chiffres, 26 liens actifs, aucune
source en échec.

`refSeq()` tente Ensembl puis UCSC (vérifié : les deux renvoient `CAGC` pour
`17:7675085-7675088`).

## 3. Ce qui reste un point de défaillance unique

Rien ne remplace VEP pour le **terme de conséquence** parmi les services appelables
depuis un navigateur. Le repli le déduit, mais c'est une heuristique : les huit motifs
couverts (faux-sens, non-sens, frameshift, synonyme, inframe, donneur, accepteur,
intronique) sont testés, pas davantage.
