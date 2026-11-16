# Vérification

Deux niveaux : un test hors réseau du générateur de commentaire, et des passages
sur variants réels couvrant chaque branche de `GetComment`.

```bash
node tools/test-comment.mjs                      # 53 vérifications, sans réseau
node tools/validate.mjs "chr17-7675088-C-T:5"    # chaîne complète sur un variant
```

## 1. Test du commentaire, hors réseau

`tools/test-comment.mjs` fabrique un contexte et vérifie **53 assertions** sur les
dix sections du commentaire, en français et en anglais :

- type de variation et localisation (faux-sens, intronique, inframe avec et sans
  longueur) ;
- fréquence : absente (`n.a.` et `AC = 0`), rare (`AC ≤ 5`), présente, et bascule
  v4.1 / v2.1.1 dans la phrase ;
- prédictions : pathogène, bénin, discordant, règle de concordance REVEL/MetaLR,
  garde-fou des deux outils minimum, absence de liste vide, phrase omise sans
  prédiction ;
- perte de fonction ;
- **conservation** : présente si faux-sens + GERP conservé + phyloP > 4 ; absente dans
  les trois cas contraires ; et vérification explicite que la chaîne
  `résidu  au cours` (le bug de la macro) n'apparaît jamais ;
- domaine protéique ; ClinVar (singulier/pluriel, traductions, conflits) ;
- phénotypes (AD, AR, XLR, XLD, sans MIM, sans transmission) ;
- conclusion des classes 3, 4 et 5, le texte HAS étant comparé **mot pour mot** ;
- structure : ligne 1 = nomenclature, ligne 2 vide, aucun espace en fin de ligne.

État : **53 / 53**.

## 2. Passages sur variants réels

Chaque variant a été choisi pour une branche précise. Les chiffres sont ceux
réellement renvoyés par les services.

| Variant | Branche visée | Résultat |
|---|---|---|
| `chr17-7675088-C-T` (TP53 p.Arg175His) | faux-sens, conservé, domaine, ClinVar, classe 5 | InterVar classe 5 ; 14 RCV ; gnomAD v4.1 AC 7 ; 6 prédictions délétères ; GERP 5,41 / phyloP 6,16 |
| `NM_000546.6:c.524G>A` | **même variant en HGVS, gène du brin −** | sortie **identique** au pseudo-VCF — complémentation des allèles correcte |
| `NM_000492.4:c.1521_1523del` (CFTR p.Phe508del) | inframe, **alignement à gauche** | `7-117559590-ATCT-A`, gnomAD v4.1 **AF 1,19 %**, 17 RCV |
| `NM_000518.5:c.118C>T` (HBB p.Gln40Ter) | non-sens → perte de fonction | InterVar classe 5 (PVS1) ; CADD 40 ; 11 RCV ; domaine Globin |
| `NM_007294.4:c.5467+1G>A` (BRCA1) | site donneur → perte de fonction, **verdict corrigé** | SpliceAI **0,93** délétère ; CADD 32 ; intron 22/22 ; gnomAD AC 2 → « rare » ; verdict « en faveur du caractère pathogène » (était « discordants ») |
| `NM_005957.5:c.665C>T` (MTHFR p.Ala222Val) | faux-sens fréquent, discordant | gnomAD **AF 31,8 %** ; InterVar classe 1 (BA1) ; délétère SIFT/PolyPhen-2/CADD/REVEL/AlphaMissense vs toléré MetaLR |
| `NM_000059.4:c.9976A>T` (BRCA2 p.Lys3326Ter) | non-sens fréquent et bénin | gnomAD AF 0,79 % ; ClinVar bénin/probablement bénin ; InterVar classe 2 |
| `NM_000492.4:c.3717+12191C>T` (CFTR) | intronique profond | intron 22/26 ; 7 RCV pathogènes ; gnomAD AC 18 |
| `NM_000492.4:c.1584G>A` (CFTR) | synonyme | exon 11/27 ; gnomAD AF 2,01 % ; ClinVar conflits → incertaine |

Les trois formes d'identifiant sont cohérentes sur un indel en répétition
(`p.Phe508del`) :

| Usage | Forme | Vérifié contre |
|---|---|---|
| gnomAD, SpliceAI, InterVar, liens | `7-117559590-ATCT-A` | gnomAD v4.1 : AC 19 237, AF 1,19 % |
| MyVariant.info | `chr7:g.117559591_117559593del` | enregistrement avec ClinVar (la forme décalée renvoie un enregistrement vide) |
| Nomenclature du compte rendu | `chr7:g.117559592_117559594del` | règle HGVS du décalage en 3′ |

### Commentaire obtenu — TP53 `chr17-7675088-C-T`, classe 5

```
hg38 chr17:g.7675088C>T NM_000546.6(TP53):c.524G>A p.Arg175His

Il s'agit d'une variation faux-sens. Elle est localisée au niveau de l'exon 5 (5/11) du gène TP53.
Cette variation est présente dans gnomAD (v4.1, fréq.: 0,0004 %).
Les outils de prédictions in silico sont en faveur du caractère pathogène de la variation (SIFT, PolyPhen-2, CADD, REVEL, MetaLR, AlphaMissense).
La variation est située au niveau d'un résidu conservé au cours de l'évolution.
Elle est localisée au niveau d'un domaine protéique fonctionnel : p53, DNA-binding domain
Cette variation a été rapportée dans Clinvar comme pathogène, probablement pathogène (14 soumissions : RCV000013173, …).

Les variations pathogènes de ce gène ont été associées à
hereditary breast carcinoma (MIM #114480).
bone marrow failure syndrome 5 (MIM #618165) de transmission autosomique dominante.
Li-Fraumeni syndrome (MIM #151623) de transmission autosomique dominante.

Cette variation est donc considérée comme pathogène (variation de classe 5) et en lien avec le phénotype clinique observé chez ce patient.
```

La quatrième phrase est celle que la **macro n'écrivait jamais** (bug de la
conservation) : c'est la seule différence de contenu attendue sur ce variant.

## 3. Comparaison avec les commentaires de la macro

Écartée, décidée le 09/11/2026 : la vérification repose sur les 53 contrôles de la
section 1 et les passages de la section 2, qui couvrent chaque branche de
`GetComment`. Le classeur fourni est de toute façon le modèle
(`MacroCES_Web.xlsm`) — ni feuille `SNV` ni commentaire enregistré, les listes de
variants patients étant des fichiers séparés.

Les écarts de contenu attendus par rapport à la macro restent listés dans le
[README](../README.md#écarts-avec-la-macro) : phrase de conservation (bug corrigé),
verdict des prédictions (corrigé), alignement des indels, et gnomAD v4.1 au lieu de
v2.1.1 dans le commentaire. Pour reproduire la source de fréquence de la macro,
lancer avec `--gnomad v2.1.1`.

## 4. Verdict des prédictions après correction

Vérifié par `tools/test-comment.mjs` et sur les variants réels :

| Cas | Avant | Après |
|---|---|---|
| BRCA1 `c.5467+1G>A` — CADD et SpliceAI délétères, REVEL/MetaLR `n.a.` | discordants | **en faveur du caractère pathogène** |
| TP53 `c.524G>A` — six outils délétères | en faveur du caractère pathogène | inchangé |
| MTHFR `c.665C>T` — REVEL délétère, MetaLR toléré | discordants | inchangé |
| CFTR `p.Phe508del` — SpliceAI seul, toléré | discordants | **discordants** (le garde-fou évite « en faveur du caractère bénin ») |
| Non-sens avec CADD délétère seul | discordants | discordants (un seul outil) |

## 5. Panne Ensembl : repli vérifié

En coupant `rest.ensembl.org` (18 requêtes refusées), la normalisation bascule sur
VariantValidator et donne une sortie **identique** à celle de VEP :

| Variant | Transcrit | MANE | exon/intron | pseudo-VCF |
|---|---|---|---|---|
| TP53 `c.524G>A` | NM_000546.6 | oui | exon 5/11 | 17-7675088-C-T |
| CFTR `p.Phe508del` | NM_000492.4 | oui | exon 11/27 | 7-117559590-ATCT-A |
| BRCA1 `c.5467+1G>A` | NM_007294.4 | oui | intron 22/22 | 17-43047642-C-T |

### Type de variation : repli contre VEP, variation par variation

VariantValidator ne rend pas de terme de conséquence. Le repli le **calcule** sur la
structure exonique d'UCSC — bornes du CDS pour les UTR, bornes des exons pour
l'épissage, nomenclature protéique pour le reste (`consequenceFromStructure`,
js/variant.js). Les deux colonnes ci-dessous sont les deux chemins exécutés sur la même
saisie, VEP d'un côté, VariantValidator + UCSC de l'autre :

| Saisie | VEP (termes rendus) | Repli | |
|---|---|---|---|
| `NM_000546.6:c.524G>A` | missense_variant | missense | = |
| `NM_000492.4:c.1521_1523del` | inframe_deletion | inframe | = |
| `NM_000518.5:c.118C>T` | stop_gained | nonsense | = |
| `NM_007294.4:c.5467+1G>A` | splice_donor_variant | splice_donor | = |
| `NM_000492.4:c.274-1G>A` | splice_acceptor_variant | splice_acceptor | = |
| `NM_000492.4:c.1585-1G>A` | splice_acceptor_variant | splice_acceptor | = |
| `NM_005957.5:c.665C>T` | missense_variant | missense | = |
| `NM_000059.4:c.9976A>T` | stop_gained | nonsense | = |
| `NM_007294.4:c.68_69del` | frameshift_variant | frameshift | = |
| `NM_000492.4:c.1584G>A` | splice_region_variant, synonymous_variant | synonymous | = |
| `NM_000492.4:c.3717+12191C>T` | intron_variant | intronic | = |
| `NM_000546.6:c.97-29C>T` | intron_variant | intronic | = |
| `NM_000546.6:c.-28C>T` | splice_region_variant, 5_prime_UTR_variant | splice_region | = |
| `NM_000546.6:c.*100G>T` | 3_prime_UTR_variant | utr3 | = |
| `NM_000546.6:c.1182A>G` | stop_lost | stop_lost | = |

**15 identiques, 0 divergentes.** Les deux dernières lignes sont celles que la lecture
des seules nomenclatures rendait fausses : `c.-28C>T` était rendu *intronique* (son
`-28` compte depuis l'ATG, pas depuis une jonction) et `c.1182A>G` *non-sens* alors que
`p.(Ter394TrpextTer9)` est l'inverse — le codon stop est **perdu** —, ce qui faisait
écrire au commentaire une perte de fonction qui n'existe pas.

Les deux avant-dernières montrent l'ordre de sévérité, repris de `CONSEQUENCE_MAP` :
en bordure d'exon, VEP rend *deux* termes et garde le plus sévère. Dans le CDS,
l'effet protéique passe devant (`c.1584G>A` reste synonyme) ; hors CDS, c'est la région
d'épissage qui passe devant l'UTR (`c.-28C>T`, première base de l'exon 2). Le repli
applique le même ordre.

Les **41** vérifications hors réseau correspondantes sont dans `tools/test-structure.mjs`
(98 au total avec la géométrie exonique, contre 57 auparavant).

### Contrôle du type par l'annotation gnomAD

gnomAD publie l'annotation VEP de chaque variation qu'il contient, appariée au transcrit
RefSeq. Trois champs ajoutés à la requête de fréquence **déjà émise** la rendent
lisible — aucun aller-retour de plus, 0,9 à 3,8 KiB selon le nombre de transcrits du
gène. Comparé au type retenu par le repli (VariantValidator + structure UCSC) :

| Variations d'épreuve | Résultat |
|---|---|
| présentes dans gnomAD | **12 concordantes, 0 divergente** |
| absentes de gnomAD, ou transcrit absent de son annotation | 3 — aucun contrôle, et rien n'est affirmé |

Les trois sans contrôle disent la limite : `c.-28C>T` et `c.1182A>G` ne sont pas dans
gnomAD, et `NM_001126112.3:c.524G>A` y est (17-7675088-C-T) mais sur un transcrit que
son annotation ne porte pas. C'est un **contrôle**, jamais une source : la plupart des
variations analysées en clinique sont justement celles que gnomAD ne connaît pas.

### Transcrit Ensembl sans Ensembl : la table MANE d'UCSC

La piste `mane` d'UCSC est la table d'appariement de MANE elle-même. Une requête d'une
base rend l'ENST versionné en face du NM versionné, les deux protéines et le statut :

| Transcrit retenu | Rendu | Temps |
|---|---|---|
| `NM_000546.6` (TP53) | `ENST00000269305.9:c.524G>A`, MANE Select | 846 ms à froid, ~0,2 s à chaud |
| `NM_000492.4` (CFTR) | `ENST00000003084.11:c.1521_1523del`, MANE Select | 199 ms |
| `NM_058195.4` (CDKN2A) | `ENST00000579755.2:c.*86G>A`, **MANE Plus Clinical** | 206 ms |
| `NM_000546.5` (version ancienne) | `ENST00000269305.9`, MANE Select | 205 ms |
| `NM_001126112.3` (non-MANE) | aucun appariement → appel à VEP | — |

La dernière ligne est la limite, et elle s'est vérifiée d'elle-même pendant la mesure :
l'appel à VEP qu'elle déclenche a **dépassé son délai de 20 s**, Ensembl étant lent ce
jour-là. C'est exactement le coût que les quatre premières lignes n'ont plus à payer.

### Ce qui restait différent entre les deux chemins

Mesuré en coupant `rest.ensembl.org` (5 requêtes refusées), donc sur le chemin de repli
de bout en bout :

| Saisie | Avant | Après |
|---|---|---|
| `NM_001126112.3:c.524G>A` (transcrit non-MANE) | « non-MANE, MANE = **?** » | « non-MANE, MANE = **NM_000546.6** » |
| `NM_000492.4:c.1584G>A` (synonyme en bordure) | Conséquence : `synonymous` | `synonymous_variant, splice_region_variant` |
| `11-1999000-G-A` (locus H19/MRPL23, sans MANE) | « Vérifier le transcrit, la position et la **base de référence** » | « **Aucun transcrit MANE à cette position** … la variation elle-même n'est pas en cause » |

Les deux premières lignes sont des différences fermées : le nom du MANE Select du gène
est lu dans la table MANE d'UCSC — l'appel que la ligne Ensembl fait déjà — et les
termes rendus repassent par le vocabulaire SO, le second terme compris lorsque la
structure l'établit (`splice_region_variant, synonymous_variant` est exactement ce que
VEP rend sur cette variation).

La troisième est une **limite**, pas un correctif. Là où le gène n'a pas de transcrit
MANE, `mane_select` écarte tous les transcrits et le repli ne peut rien annoter ; VEP,
lui, annote NR_002196.3. L'ancien sélecteur `mane` échouait de la même façon
(`intergenic_variant_1`, sans nomenclature), et `all`/`raw` sont dépréciés sur cet
endpoint pour une entrée génomique. `refseq_select` répondrait — trois transcrits, sans
indicateur MANE — mais en retenant le premier il donnerait *MRPL23* là où VEP donne
*H19* : un autre gène, donc un autre compte rendu. Le choix est donc de refuser en le
disant, plutôt que de deviner.

Le refus porte son propre code (`NO_MANE_TRANSCRIPT`) et son propre message, parce qu'il
n'est ni une panne ni une saisie fautive. La variation reste analysable : saisie en
HGVS, `NR_002196.3:n.100G>A` passe par le repli et rend `11-1997743-C-T`.

### Transcrit du repli : `mane_select` et non `mane`

Sur un gène qui a un transcrit **MANE Plus Clinical**, `mane` renvoie deux entrées et
la réponse ne dit pas laquelle lire. Mesuré sur CDKN2A, `NC_000009.12:g.21970917C>T` :

| Sélecteur | Entrées rendues |
|---|---|
| `mane` | `NM_000077.5:c.442G>A` (MANE Select, p.(Ala148Thr)) **et** `NM_058195.4:c.*86G>A` (MANE Plus Clinical, p.(=)) |
| `mane_select` | `NM_000077.5:c.442G>A` seule |

Soit, selon la clé retenue, un faux-sens de l'exon 2 ou une variation 3'UTR : deux
comptes rendus différents pour la même saisie. Une saisie HGVS ne renvoie que le
transcrit demandé — vérifié sur `NM_001126112.3:c.524G>A`, transcrit non-MANE : une
seule clé, celle de la saisie. Le repli rend désormais, sur `9-21970917-C-T`,
`NM_000077.5` — faux-sens, exon 2/3.

Chaîne complète sous panne simulée sur `p.Phe508del` : gnomAD AC 19 237 (AF 1,19 %),
17 soumissions ClinVar, HGNC 1884, GeneID 1080, UniProt P13569, 2 phénotypes,
**26 liens actifs, aucune source en échec**, commentaire complet.

Deux niveaux de résistance, tous deux observés en conditions réelles :

- **salves d'erreurs** — `rest.ensembl.org` a renvoyé des `500` sur trois sondages
  consécutifs pendant qu'une analyse tournait : les réessais à palier croissant ont
  absorbé la salve et la normalisation s'est faite par **VEP**, sans repli ;
- **panne totale** — Ensembl coupé, la normalisation passe par **VariantValidator**
  (tableau ci-dessus).

Détail des mesures et des alternatives écartées : [ensembl.md](ensembl.md).

## 6. Saisies sans transcrit : HGVS g. et gène + c.

Deux formes de saisie où aucun transcrit n'est nommé, et où c'est donc le **MANE
Select** qui est annoté (16/11/2026, les deux chemins de normalisation exercés) :

| Saisie | Transcrit retenu | MANE | Sortie |
|---|---|---|---|
| `chr1:g.11117005T>A` | NM_004958.4 (MTOR) | oui | `c.7015A>T` p.(Arg2339Ter), non-sens, exon 50, 1-11117005-T-A |
| `1:g.11117005T>A` | NM_004958.4 | oui | **identique** — le préfixe `chr` est facultatif |
| `NC_000017.11:g.7675088C>T` | NM_000546.6 (TP53) | oui | `c.524G>A` p.(Arg175His), faux-sens, exon 5 — identique à `chr17-7675088-C-T` |
| `chr7:g.117559593_117559595del` | NM_000492.4 (CFTR) | oui | `c.1522_1524del` p.(Phe508del), exon 11, 7-117559592-CTTT-C — **même sortie par VEP et par le repli** |
| `MTHFR:c.665C>T` | NM_005957.5 | oui | **sortie identique, champ par champ**, à celle de `NM_005957.5:c.665C>T` (152 ms contre 215 ms) |
| `H19:n.1000G>A` | NR_002196.3 | oui | le MANE Select d'un ARN long non codant est un `NR_` : filtrer sur `NM_` l'aurait écarté |
| `MLL:c.100A>G` | NM_001197104.2 (KMT2A) | oui | symbole **retiré** résolu par `prev_symbol` (HGNC) ; la variation est ensuite refusée sur la base de référence, ce qui montre que la résolution a bien eu lieu |

Et les deux refus que la résolution peut opposer, distincts d'une panne :

| Saisie | Code | Message |
|---|---|---|
| `NOTAGENE:c.100A>G` | `GENE_UNKNOWN` | symbole inconnu de HGNC (trois champs) **et** de VariantValidator |
| `MIR21:c.10A>G` | `GENE_NO_MANE` | gène connu, sans transcrit MANE Select — la saisie doit nommer un transcrit |

Une accession NC_ d'un **autre** assemblage n'est pas réécrite en hg38 :
`NC_000001.10:g.…` (hg19) reste une saisie HGVS, transmise telle quelle aux services.

Le MANE Select du gène est lu chez HGNC (`mane_select`, les deux accessions appariées),
avec `gene2transcripts_v2` de VariantValidator en repli — mesuré à 146 ms et ~1 KiB sous
la restriction `mane_select`, `Access-Control-Allow-Origin: *`. La résolution précède la
course VEP/VariantValidator : les deux sources reçoivent alors la **même** nomenclature
sur le **même** transcrit, au lieu de laisser chacune choisir sur quel transcrit compter
la position c. — ce qui ferait désigner deux variations différentes à la même saisie
selon le service qui gagne la course.

## 7. Classification ACMG : ce que les chiffres étayent

Le panneau ne calcule aucune classe ; ce qu'on vérifie ici, c'est que chaque critère est
posé sur le bon chiffre, et surtout qu'aucun ne l'est sans chiffre (16/11/2026,
application servie en local et DOM relu hors écran).

| Saisie | Étayés par les chiffres | À trancher sur la maladie |
|---|---|---|
| TP53 `chr17-7675088-C-T` (faux-sens) | `PM1` domaine InterPro p53, DNA-binding domain · `PP3` délétère pour SIFT, PolyPhen-2, CADD, REVEL, MetaLR, AlphaMissense | — |
| TP53 `NM_000546.6:c.376-1G>A` (site accepteur) | `PVS1` variation au niveau du site accepteur, intron 4/10, **saut de l'exon 5 hors phase** · `PP3` | — |
| MTHFR `c.665C>T` | `BA1` fréquence 31,8214 % | `BS2` 87 723 homozygotes, maladie récessive |
| CFTR `NM_000492.4:c.1521_1523del` | `PM4` inframe de 3 nucléotides | `BS1` 1,1931 % · `BS2` 58 homozygotes |

La dernière ligne est la raison d'être de la seconde colonne : `p.Phe508del` est de
classe 5, et au seuil conventionnel de 1 % elle déclenche BS1 pendant que ses homozygotes
de gnomAD sont des patients. Annoncer « BS1 BS2 étayés » sur cette variation serait une
faute ; montrer les deux chiffres sous l'étiquette qui dit ce qu'ils valent ne l'est pas.

Les refus, qui comptent autant que les critères posés (vérifiés hors réseau,
tools/test-comment.mjs) :

| Situation | Ce que rend le panneau |
|---|---|
| gnomAD encore en vol | aucun critère de fréquence, et la source est nommée en attente |
| gnomAD en panne (503) | aucun critère de fréquence — un « absente de gnomAD » serait PM2 posé sur une panne |
| SpliceAI en vol | aucun verdict de prédicteurs : il peut encore retourner |
| variation sans coordonnées VCF | aucun critère de fréquence : gnomAD n'a pas été interrogé |
| GERP absent | pas de `BP7` : une conservation inconnue n'est pas une conservation faible |
| base conservée, ou SpliceAI délétère | pas de `BP7` |
| maladie dominante, ou aucun homozygote | pas de `BS2` |
| indel | `InterVar` en n.a., avec la raison : le service ne traite que les substitutions |

29 vérifications hors réseau de plus dans test-comment.mjs (162), dont la frontière
étayé/conditionnel sur `p.Phe508del` et les deux langues.
