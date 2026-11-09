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

## 3. Ensembl ne tombe pas : il pend

Le vrai mode de défaillance observé n'est pas l'erreur franche mais la **connexion
qui ne répond jamais**. Trace d'une analyse de `NM_000546.6:c.524G>A` :

```
 40024ms +40015ms  ERR(AbortError)   /vep/human/hgvs/...
 45072ms + 4247ms  503               /vep/human/hgvs/...
 86677ms +40004ms  ERR(AbortError)   /vep/human/hgvs/...
103554ms +13675ms  200               /vep/human/hgvs/...
```

**103 s rien que pour la normalisation** — tout le reste de la chaîne prenait 2,2 s.
Deux causes cumulées : un délai d'expiration de 40 s (absurde pour un service qui
répond en 0,2 s quand il va bien), et une politique de réessai qui attendait
l'expiration complète avant de songer au repli.

Corrections :

- **délai VEP ramené à 8 s**, et **sans réessai** : le repli est VariantValidator, pas
  une nouvelle tentative sur Ensembl. Avec `retries: 2`, un `500` connu dès 160 ms
  n'était signalé à la course qu'au bout de 2,8 s (voir [latence.md](latence.md) § 3a) ;
- **course (hedging)** : VEP est lancé, et si rien n'est revenu au bout de **200 ms**,
  VariantValidator est lancé *en parallèle* — la première réponse gagne. Plus besoin
  d'attendre l'échec de VEP pour basculer. 200 ms laissent 5× la médiane de VEP
  (39 ms), et VEP garde la course s'il répond avant VariantValidator (~1,3 s) ;
- **plafond global de 60 s** par étape, et un **compteur d'avancement** dans
  l'interface (« Normalisation du variant… (3 s) », « Ensembl tarde à répondre —
  repli sur VariantValidator… ») : la page ne peut plus paraître figée ;
- délais des autres sources ramenés à 12–20 s.

Résultat mesuré sur le même variant :

| Situation | Avant | Après (délai 2,5 s) | Après profilage |
|---|---|---|---|
| Ensembl sain | ~3 s | 2,9 s | **380–620 ms** |
| Ensembl lent (cas réel) | **103 s** | 5–6 s (repli) | **~1,4 s** (repli) |
| Ensembl qui pend indéfiniment | jamais de réponse utile | 3,2 s (repli) | **~1,4 s** (repli) |

La dernière colonne vient du travail de profilage décrit dans
[latence.md](latence.md) : l'attente morte avant le repli n'était qu'un des huit
postes, et la normalisation n'était que le premier des trois étages successifs que la
chaîne enchaînait.

## 4. Ce qui reste un point de défaillance unique

Rien ne remplace VEP pour le **terme de conséquence** parmi les services appelables
depuis un navigateur. Le repli le déduit, mais c'est une heuristique : les huit motifs
couverts (faux-sens, non-sens, frameshift, synonyme, inframe, donneur, accepteur,
intronique) sont testés, pas davantage.
