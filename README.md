# variant-toolbox

Version web de la **ToolBox SNV** de `MacroCES_Web.xlsm` : saisie d'une variation,
récupération des chiffres, liens vers les bases, et rédaction du commentaire en
français ou en anglais.

Page statique, sans étape de build, hébergée sur GitHub Pages.
→ **https://jimouse.github.io/variant-toolbox/**

## Utilisation

1. Saisir la variation, sous l'une des quatre formes :
   - HGVS sur transcrit RefSeq — `NM_000546.6:c.524G>A` (le gène entre parenthèses
     est accepté : `NM_000546.6(TP53):c.524G>A`) ;
   - pseudo-VCF hg38 — `chr17-7675088-C-T` (`17:7675088:C:T` fonctionne aussi) ;
   - HGVS génomique hg38 — `chr1:g.11117005T>A` (`1:g.…` et l'accession RefSeq
     `NC_000001.11:g.…` fonctionnent aussi) ;
   - gène + nomenclature, sans transcrit — `MTHFR:c.665C>T`.
2. Choisir la classe (3, 4 ou 5).
3. **Analyser.** Les chiffres, les liens et le commentaire s'affichent ;
   le bouton **Copier** du commentaire met celui-ci dans le presse-papier, et chaque
   nomenclature de l'encart **Identité de la variation** porte le sien (voir plus bas).

Le choix du **transcrit** suit la saisie : une entrée HGVS utilise le transcrit saisi,
avec une indication MANE oui/non (et le transcrit MANE rappelé si ce n'est pas
celui-là) ; les trois autres formes n'en nomment aucun et utilisent le transcrit
**MANE Select**. Le **transcrit Ensembl** correspondant et sa nomenclature c. sont
affichés à côté (voir plus bas).

Pour les deux formes sans transcrit autres que le pseudo-VCF, **l'interface le dit** :
une entrée `chr1:g.…` annonce le MANE Select sur lequel porte l'annotation, et une
entrée `MTHFR:c.665C>T` annonce celui sur lequel la position c. a été **comptée** —
c'est lui qui décide alors de quelle variation il s'agit, et non seulement de la
nomenclature rendue. Le MANE Select du gène est lu chez **HGNC** (champ `mane_select`,
~40 ms), avec **VariantValidator** (`gene2transcripts_v2`, ~150 ms) en repli ; les deux
reconnaissent les symboles retirés (`MLL` → `KMT2A`), et le symbole d'aujourd'hui est
alors signalé. Un gène inconnu, un gène sans transcrit MANE Select (micro-ARN) et deux
services muets donnent trois messages distincts : ils ne se corrigent pas de la même
façon.

**Langue** : détectée depuis le navigateur, bouton FR/EN, choix mémorisé.
Le commentaire suit la langue de l'interface.

On peut aussi partager une variation par l'URL :
`?v=chr17-7675088-C-T&class=5&lang=fr`

## Clés API

Saisies dans le panneau **Clés API**, stockées **uniquement dans le navigateur**
(`localStorage`) et jamais dans le dépôt.

| Clé | Avec la clé | Sans la clé |
|---|---|---|
| **OMIM** | phénotypes et transmission depuis l'API OMIM | repli sur Monarch (nom, numéro MIM, transmission) |
| **MobiDetails** | création/lecture de l'identifiant et lien vers la fiche de la variation | lien vers la page d'accueil |

> ⚠️ La clé MobiDetails est écrite **en dur** dans `ToolBox.GetMobiId` (VBA).
> Elle n'est pas reprise ici, et le classeur `.xlsm` est exclu par `.gitignore`.
> Elle est à considérer comme exposée : à régénérer.

OMIM n'envoie aucun en-tête CORS : l'appel échoue normalement depuis un navigateur,
même avec une clé valide. L'application tente l'appel (utile derrière un proxy) puis
retombe silencieusement sur Monarch.

## Sources des chiffres

| Donnée | Source |
|---|---|
| Gène, transcrit, conséquence, exon/intron, HGVS c./p./g., MANE | Ensembl VEP REST (`refseq=1`) |
| Les mêmes, Ensembl en panne | VariantValidator (`mane_select`), le type de variation étant **calculé** sur la structure UCSC |
| Transcrit Ensembl et nomenclature c. correspondante | apparié par VEP (`mane_select`), sinon table MANE d'UCSC (piste `mane`), sinon Ensembl VEP REST sur le cache Ensembl |
| Contrôle du type de variation | annotation VEP publiée par gnomAD, dans la requête de fréquence déjà émise |
| gnomAD v4.1 exomes + génomes (AC, htz, hmz, AF) | API GraphQL gnomAD |
| gnomAD v2.1.1 exomes | MyVariant.info (`gnomad_exome`) |
| SIFT, PolyPhen-2, AlphaMissense, REVEL, MetaLR, CADD, GERP++, phyloP, phastCons, InterPro | MyVariant.info (`dbnsfp`) |
| SpliceAI | services Cloud Run de SpliceAI-lookup (hg38) |
| ClinVar (signification agrégée + accessions RCV, VariationID pour le lien vers la variation) | MyVariant.info (`clinvar`) |
| InterVar + critères ACMG | API wInterVar |
| UniProt, HGNC, MIM du gène, NCBI GeneID | genenames.org (HGNC), repli mygene.info + E-utilities |
| Phénotypes, MIM, transmission | OMIM (avec clé) ou Monarch |
| Structure exonique du transcrit (bornes des exons, CDS, brin) | API UCSC, piste `ncbiRefSeq` (hg38) |

Le détail des tests CORS — et la liste de ce qui reste en **lien seul** — est dans
[docs/cors.md](docs/cors.md). En résumé : seuls **CADD**, **OMIM** et **Orphanet**
refusent les appels depuis une page web. Le score CADD phred vient donc de MyVariant
(le même champ que lisait la macro).

**Ensembl** : les deux formes de saisie passent par `GET /vep/human/hgvs`, mesuré à
14/14 là où `GET /vep/human/region` échoue 8 fois sur 14. Ensembl ne tombe pas
franchement, il **laisse pendre la connexion** : VEP est donc lancé avec un délai de
8 s et sans réessai, et si rien n'est revenu au bout de 200 ms **VariantValidator est
lancé en parallèle**, la première réponse gagnant la course. La séquence de référence
bascule de même sur l'**API REST d'UCSC**. Une analyse qui prenait 103 s pendant un
épisode de lenteur en prend 1,4. L'interface affiche un compteur d'avancement et
plafonne chaque étape à 60 s. Mesures et limites : [docs/ensembl.md](docs/ensembl.md).

**Le type de variation du repli n'est pas deviné.** VariantValidator donne tout sauf le
terme de conséquence. Il était jusqu'ici lu sur les seules nomenclatures, ce qui tenait
du pari sur les cas de bordure : `c.-28C>T` passait pour intronique alors que son `-28`
compte depuis l'ATG, et `p.(Ter394TrpextTer9)` pour un non-sens alors que c'est son
contraire — le codon stop **perdu** —, ce qui ajoutait au commentaire une perte de
fonction imaginaire. Il est maintenant **calculé** : bornes du CDS pour les UTR, bornes
des exons pour l'épissage, nomenclature protéique pour le reste. La structure vient
d'UCSC, déjà demandée pour les schémas — donc sans appel supplémentaire, et sans
Ensembl. Sur les 15 variations d'épreuve, le type rendu est **identique à celui de
VEP**, bordures d'exon comprises ([docs/validation.md](docs/validation.md#5-panne-ensembl--repli-vérifié)).

**Le transcrit Ensembl ne demande plus Ensembl non plus**, quand le transcrit retenu
est un transcrit MANE. La piste `mane` d'UCSC *est* la table d'appariement de MANE :
997 octets et ~0,2 s à chaud donnent l'ENST versionné en face du NM, là où il fallait
un second appel à VEP sur le cache Ensembl — celui dont le délai est à 20 s parce qu'un
gène à beaucoup de transcrits y coûte 13 à 14 s. La garantie de numérotation c. est la
même que pour l'appariement rendu par VEP : c'est la définition de MANE. Un transcrit
**non**-MANE continue de passer par VEP, faute d'appariement publié.

**Le type de variation est contrôlé par gnomAD**, sans requête de plus : gnomAD publie
l'annotation VEP de chaque variation qu'il contient, apparié au transcrit RefSeq, et
trois champs ajoutés à la requête de fréquence suffisent à la lire. Sur les 12
variations d'épreuve présentes dans gnomAD, le terme est **concordant 12 fois sur 12**.
Ce n'est pas une source de repli : une variation absente de gnomAD — la plupart de
celles qu'on analyse — ne renvoie rien, et ce silence ne dit rien du type. L'écart,
s'il arrive, est signalé en nommant les deux termes et leur origine.

**Ce qui reste différent, et ce que l'avertissement dit donc.** Le type de variation,
lui, ne l'est plus : il est établi, concordant avec VEP sur les 15 variations d'épreuve
et confirmé par gnomAD quand il la connaît. L'encart nomme aussi le MANE Select du gène
sur un transcrit non-MANE — VEP le rendait toujours, VariantValidator jamais, et la
ligne affichait « MANE = ? » — et la ligne « Conséquence » parle le même vocabulaire SO
des deux côtés, `splice_region_variant` compris. Il reste **le transcrit**, et une
limite précise : là où le gène n'a pas de transcrit MANE — ARN long non codant, locus
intergénique —, le repli n'a rien à annoter. Il le dit alors pour ce qu'il est, sans
envoyer corriger une saisie correcte, et la variation reste analysable en la saisissant
en HGVS sur le transcrit voulu. C'est pourquoi l'avertissement du repli se réduit
désormais à « vérifier le transcrit » : c'est la seule chose qui puisse encore différer
de ce que VEP aurait choisi.

Quand les **deux** sources tombent ensemble — c'est arrivé, Ensembl en HTTP 500 et
VariantValidator en maintenance — aucune analyse n'est possible : sans gène ni
coordonnées, aucune base n'est interrogeable. L'interface le dit alors explicitement,
avec le détail par service, et distingue deux cas qu'il ne faut pas confondre : les
services sont **tombés** (délai, 503) et il faut réessayer plus tard, ou l'un d'eux a
**répondu en refusant** la variation (base de référence qui ne correspond pas, transcrit
inconnu) et c'est la saisie qu'il faut corriger. Un refus l'emporte sur une panne : il
renseigne, là où réessayer ne changerait rien. Le repli est borné à 12 s, car la page
« 503 » de VariantValidator met elle-même 15 s à arriver et la réessayer portait la
panne à 31 s.

## Temps d'analyse

| Situation | Durée |
|---|---|
| VEP répond (cas normal, ~39 ms) | **380–620 ms** |
| Ensembl **en panne**, repli VariantValidator | **801 ms** de médiane, 16 analyses sur 24 sous la seconde |

L'affichage est **progressif** : l'identité de la variation (gène, transcrit, MANE,
conséquence, HGVS, exon) apparaît dès la normalisation, puis chaque bloc se remplit à
mesure que les sources répondent. Une valeur encore en vol s'affiche « … » et non
« n.a. » — en clinique, « n.a. » affirme que la base a répondu sans connaître la variation.
Le **commentaire n'est pas rédigé tant qu'une source manque**, et les boutons Copier et
Régénérer restent désactivés : un commentaire partiel annoncerait des absences non
vérifiées.

Chaque nouvelle analyse **efface l'écran** avant de commencer — y compris quand la
saisie est refusée d'emblée. Les panneaux de la variation précédente ne restent donc
jamais affichés pendant la normalisation de la suivante, et son commentaire n'est plus
copiable : l'écran ne doit jamais montrer les chiffres d'une variation sous l'identité
d'une autre.

Profil détaillé, latence mesurée de chaque service et les huit corrections qui ont fait
passer l'analyse de 7,8–8,9 s à moins d'une seconde : [docs/latence.md](docs/latence.md).

Trois d'entre elles pèsent le plus : la course VEP/VariantValidator ne perd plus 2,5 s
en attente morte, la chaîne des phénotypes tourne **en parallèle** des autres sources
au lieu de les suivre, et `genenames.org` remplace en un appel de 38 ms la paire
mygene.info + E-utilities qui coûtait 1,4 s. La page ouvre aussi ses connexions TLS
**pendant la saisie** (`warmUp`) : la seule poignée de main de MyVariant coûte 1,3 s.

## Nomenclatures

L'encart **Identité de la variation** porte les cinq nomenclatures, et finit par la
**nomenclature complète** — la même ligne, mot pour mot, que la première ligne du
commentaire : `hg38 chr17:g.7675088C>T NM_000546.6(TP53):c.524G>A p.(Arg175His)`.

**Un bouton de copie par nomenclature**, posé au bout de sa ligne : HGVS c. (RefSeq
et Ensembl), p., g., pseudo-VCF et nomenclature complète. Il copie la **valeur
seule**, exactement celle qui est affichée — c'est pourquoi « hg38 » est écrit en note
sur la ligne du `g.` et non collé devant la nomenclature : un
`hg38 chr17:g.7675088C>T` n'entre pas dans la recherche d'une base. Le bouton
**Copier la nomenclature** de l'en-tête copie la nomenclature complète, exactement
comme le bouton de sa ligne : c'est la ligne que le compte rendu recopie.

**Transcrit Ensembl.** Le transcrit RefSeq retenu est doublé de son équivalent
Ensembl et de la nomenclature c. correspondante. Sur un transcrit **MANE Select** —
la quasi-totalité des cas — rien n'est demandé au réseau : VEP rend déjà l'ENST
apparié dans `mane_select`, et la numérotation c. est la même des deux côtés, par
définition de MANE Select (même intervalle génomique, même CDS, mêmes UTR). Sinon un
second appel à VEP est fait, sur le **cache Ensembl** cette fois — VEP sert l'un ou
l'autre jeu de transcrits, jamais les deux. L'ENST retenu est, dans l'ordre : celui
que VEP apparie lui-même au transcrit saisi, celui dont la numérotation c. est
identique (même CDS), puis le MANE Select ou le canonique — ces deux derniers
décrivant un **autre** transcrit, ce que la ligne signale. Cet appel n'entre dans
aucun chiffre et dans aucune phrase du commentaire, qui ne l'attend donc pas.

**Parenthèses du `p.`** — la conséquence protéique s'écrit `p.(Arg175His)` et non
`p.Arg175His` : en nomenclature HGVS, les parenthèses disent « déduit, non observé ».
Elle l'est toujours ici, ni VEP ni VariantValidator ne lisant la protéine. VEP les
omet, VariantValidator les écrit : la forme est posée en un seul endroit
(`predictedProtein`, `js/util.js`), pour que l'encart, la nomenclature complète et le
commentaire ne divergent pas. `p.?` — effet protéique indéterminé — reste nu.

## Seuils

Ceux de la macro : CADD > 15, REVEL > 0,5, SpliceAI > 0,5, GERP ≥ 2 = conservé,
AlphaMissense `B` = toléré, SIFT/PolyPhen-2/MetaLR `T`/`B` = toléré et `D`/`P`/`A` = délétère.
Vert = toléré, rouge = délétère.

## Structure exonique : la variation est-elle en bordure ?

Sous l'identité de la variation, un panneau **Structure exonique** répond à une question que
ni la conséquence rendue par VEP ni « exon 5/11 » ne tranchent : **à combien de paires
de bases la variation est-elle de la jonction la plus proche ?** « Faux-sens » ne dit
pas si le nucléotide touché est le dernier de son exon, et TP53 `c.375G>A` — dernière
base de l'exon 4, donc sur le site donneur — est annoté `synonymous_variant` par VEP.

Le panneau donne d'abord les chiffres :

| | |
|---|---|
| Position | exon 4/11 — 279 pb, base 279 de l'exon |
| Site accepteur (5′) | 278 pb |
| Site donneur (3′) | **0 pb** |
| Bordure exonique | **oui — sur la base de bordure elle-même, côté donneur** |
| Saut d'exon | **en phase** — le saut de l'exon 4 (site donneur, 279 pb codantes) retirerait 93 acides aminés sans décaler le cadre de lecture |

puis deux schémas. Le premier situe la variation **dans le transcrit entier** : exons en
boîtes, parts traduites en plein et UTR en demi-hauteur, introns en trait. Le second
**zoome sur la jonction la plus proche**, à l'échelle de la paire de bases, avec une
graduation à la base sous les fenêtres courtes et la distance cotée de la variation à
chaque jonction visible.

**Seuils employés** — ceux des définitions existantes, pas des seuils maison :
*bordure exonique* = les 3 premières ou 3 dernières bases de l'exon, qui est la
définition de `splice_region_variant` chez VEP ; *site canonique* = ±1 et ±2 dans
l'intron ; *région d'épissage intronique* = jusqu'à +8/−8. Entre la 4e et la 10e base de
l'exon, le panneau dit « non, mais proche ».

**Saut d'exon : quel exon, et en phase ou non.** Une fois le site d'épissage mis en
cause, la question suivante est celle de PVS1 : que devient le cadre de lecture si
l'exon saute ? Elle se tranche sur une longueur — part codante multiple de 3, le saut
retire des acides aminés sans décaler le cadre ; sinon il le décale, et la conséquence
rejoint celle d'un frameshift. Aucun des chiffres au-dessus n'y répond, pour une raison
qui est le cœur du calcul : **l'exon sauté n'est pas toujours celui qu'ils mesurent.**
Côté donneur c'est l'exon précédent, côté accepteur **le suivant** — `c.376-1G>A` est
dans l'intron 4 et met en cause l'exon **5**, qui fait 184 pb et saute donc hors phase.
La ligne nomme l'exon pour cette raison, et le schéma du transcrit l'**encadre en
pointillés** : c'est le seul endroit où le cadre et l'épingle de la variation ne
désignent pas le même exon.

La longueur comptée est la **part codante** de l'exon, et non l'exon entier : sur les
exons qui bordent le CDS les deux diffèrent, et c'est la part codante qui porte le cadre
de lecture. Quand le saut emporterait en plus le codon d'initiation ou le codon stop —
CFTR `c.53+1G>T`, dont l'exon 1 ne compte que 53 pb codantes et porte l'ATG — la phase
ne décrit plus la conséquence, et la ligne le dit au lieu d'annoncer un chiffre. La
ligne paraît dès qu'un site est en cause au sens des seuils ci-dessus : site canonique,
région d'épissage intronique, bordure exonique, jonction emportée. Au-delà de ±8 et au
cœur d'un exon, elle n'est pas écrite.

**Ce que la ligne n'affirme pas.** Le saut d'exon est la conséquence de *référence*
d'une variation d'épissage, pas la seule : une rétention d'intron ou l'usage d'un site
cryptique en produiraient une autre, et rien ici ne vérifie laquelle survient — ce
module ne connaît que la géométrie du transcrit. Les verbes sont au conditionnel pour
cette raison, et hors d'un site canonique ou d'une jonction emportée — où l'atteinte est
acquise — la ligne se signale en avertissement plutôt qu'en alerte.

**Échelles.** Dans la vue du transcrit, les longueurs d'exons sont **compressées en
racine carrée** et les introns sont **hors échelle** : à l'échelle linéaire, le dernier
exon de TP53 (1 270 pb avec son 3'UTR) prend la moitié du schéma et l'exon 3 (22 pb)
disparaît. Seule la position de la variation *à l'intérieur de son exon* y reste
proportionnelle. Le zoom, lui, est à l'échelle de la base, sans rupture : ce que l'œil y
mesure est la distance réelle. Les deux schémas sont dessinés **dans le sens du
transcrit** — la gauche est le 5', y compris sur un gène du brin −, où les coordonnées
génomiques décroissent.

Une variation intronique s'épingle **du côté de la jonction dont elle est proche**, et
non au milieu de l'intron : au milieu, `c.548+1G>A` et un intron profond se dessinaient
au même endroit, et le schéma montrait une variation perdue au cœur de l'intron là où
elle est posée sur le site donneur. La fraction ne mesure toujours aucune distance — ces
neuf unités restent hors échelle — elle dit de quel bord la variation est proche ; le
décalage chiffré, lui, est écrit dans l'étiquette : `intron 4 (+1)`.

**Un fait, un repère.** Au zoom, le trait de jonction et le rectangle de la variation
tombent au même endroit dès que la variation touche la bordure, dans la même couleur, le
trait débordant du rectangle en haut et en bas comme s'il le barrait : on lisait deux
repères rouges pour un seul fait, et les deux étiquettes posées l'une sous l'autre se
lisaient comme les deux lignes d'une même légende. Quand la jonction tombe **sous** le
rectangle, elle n'a donc plus de trait — le bord de la boîte d'exon la montre déjà — et
son nom rejoint l'étiquette de la variation : « variation — exon 4 / intron 4 ». Une
délétion qui emporte une jonction, ou un exon entier, donnait la même image en plus
large et suit la même règle. Les cotes, elles, courent de la jonction jusqu'à la base
que le chiffre compte, soit exactement autant de bases que la graduation en montre :
un « 1 pb » dessinait auparavant une demi-base.

**Source.** La structure vient de l'API UCSC (piste `ncbiRefSeq`, `Access-Control-Allow-Origin: *`),
interrogée sur **une seule base** : l'API renvoie tout enregistrement qui *chevauche*
l'intervalle, donc le transcrit entier dès lors que la variation tombe dedans.
Mesuré à 13 KiB et ~0,7 s (1,6 KiB sur CFTR, 16 KiB sur DMD). Elle remplace l'appel
`gene2transcripts` de VariantValidator — **203 KiB en 1,5 à 3,4 s** — qui ne servait
qu'à obtenir le total d'exons du repli ; `gene2transcripts_v2`, plus léger, ne renvoie
jamais `genomic_spans` et ne pouvait pas servir ici. VariantValidator reste le repli
pour ce seul total si UCSC ne connaît pas le transcrit.

Le **commentaire n'attend pas** cette source : elle n'alimente aucune de ses phrases —
sauf précisément dans le cas où elle porte le total d'exons manquant (« exon 5 » →
« exon 5/11 »), et c'est alors le seul cas où le commentaire la retient.

UCSC ne sert que la **version courante** de chaque transcrit : une saisie sur
`NM_000546.5` affiche la structure de `NM_000546.6` et le panneau le signale, car les
bornes d'exons peuvent avoir changé. Un désaccord entre le numéro d'exon calculé ici et
celui de la normalisation est également affiché plutôt que tu.

## Classification ACMG

Un panneau **Classification ACMG** reprend les chiffres déjà affichés et dit quels
critères ACMG/AMP ils étayent — avec, à chaque fois, **le chiffre qui les porte et la
réserve qui reste**. Il ne calcule **aucune classe** : la seule classe de l'application
est celle que vous posez dans le formulaire.

Quatre listes, et la frontière entre elles porte autant que leur contenu.

1. **Étayés par les chiffres** — le chiffre suffit à poser le critère.

   | Critère | Ce qui le déclenche |
   |---|---|
   | `PVS1` | variation nulle (non-sens, frameshift, site ±1/±2), avec la phase du saut d'exon quand la structure la donne — l'entrée même de l'arbre de décision PVS1 |
   | `PVS1_Moderate` | perte du codon d'initiation, ramenée à « modéré » comme le recommande le ClinGen SVI |
   | `PM1` | domaine protéique InterPro, sur un faux-sens ou un inframe |
   | `PM2_Supporting` | absente de gnomAD, ou AC 0 — force ramenée à « supporting » (SVI 2020) |
   | `PM4` | inframe ou perte du codon stop |
   | `PP3` / `BP4` | verdict des prédicteurs, celui-là même qui écrit la phrase du commentaire |
   | `BA1` | fréquence ≥ 5 % — le seul seuil autonome de l'article de 2015 |
   | `BP7` | synonyme ou intronique profond, SpliceAI sous le seuil **et** base peu conservée |

2. **Suggérés par un chiffre, à trancher sur la maladie** — `BS1` (fréquence ≥ 1 %) et
   `BS2` (homozygotes de gnomAD sur une maladie récessive). Ces deux-là ne sont **pas**
   posés, et la séparation vient d'un cas : CFTR `p.Phe508del`, la variation de classe 5
   la plus fréquente de la mucoviscidose, affiche 1,19 % d'allèles et 58 homozygotes
   dans gnomAD v4.1. Au seuil conventionnel de 1 %, BS1 se déclenche ; et ces
   homozygotes sont des patients, non des témoins. Les deux chiffres restent affichés —
   ils mesurent la fréquence des porteurs — sous une étiquette qui dit ce qu'ils valent.

3. **À préciser** — tout ce qu'aucun chiffre récupéré ici ne peut poser, rangé selon le
   plan du **référentiel ANPGM**, c'est-à-dire dans l'ordre où le dossier se constitue
   et non dans celui d'une table de codes :

   | Rubrique ANPGM | Critères |
   |---|---|
   | Données de fréquence des variants chez les patients | `PS4` |
   | Critères cliniques | `PP4`, `BP5` |
   | Co-occurrence de variants | `PM3`, `BP2` |
   | Données de ségrégation | `PS2`, `PM6`, `PP1`, `BS4` |
   | Variation affectant la longueur de la protéine | `BP3` |
   | Type et contexte de la variation | `PP2`, `BP1` |
   | Localisation du variant | `PS1`, `PM5` |
   | Prédictions bio-informatiques | *(aucune case : rubrique calculée, voir plus bas)* |
   | Données fonctionnelles | `PS3`, `BS3` |

   La rubrique des prédictions garde sa place **sans aucune case** : c'est la seule du
   plan que l'application remplit elle-même, et elle le dit en une phrase calculée sur
   la variation en cours :

   - **hors faux-sens et inframe** — « Ne s'applique pas à ce type de variation
     (*variation au niveau du site accepteur d'épissage*) : SIFT, PolyPhen-2, REVEL,
     MetaLR et AlphaMissense ne notent que le changement d'acide aminé. » Ces cinq-là
     sont des prédicteurs de faux-sens ; CADD et SpliceAI, eux, notent tous les types,
     et la phrase continue donc avec ce qu'ils disent ;
   - **le verdict des outils qui ont noté** — « délétère (CADD, SpliceAI) », « toléré
     (…) », « discordant (délétère : … ; toléré : …) », ou « un seul outil l'a notée
     (SpliceAI, toléré) : pas assez pour affirmer une direction » — ce dernier cas
     étant le garde-fou du verdict (`MIN_TOOLS_FOR_DIRECTION`), rencontré sur
     `p.Phe508del` ;
   - **ce qui en est tiré** — « PP3 est posé plus haut sur ces chiffres », ou « aucun
     critère n'est posé sur ces chiffres ».

   Tant que MyVariant ou SpliceAI n'ont pas répondu, la rubrique affiche l'attente : un
   verdict qui peut encore changer de camp ne vaut pas mieux qu'une case vide.

Puis un **contrôle automatique** : la classe et les critères d'InterVar, qui étaient
jusqu'ici dans l'encart « Chiffres ». Contrôle et non conclusion — et InterVar ne traite
que les substitutions, ce que le panneau dit quand il ne rend rien sur un indel.

**`PP5` et `BP6` ne sont jamais posés** : ClinGen les a retirés en 2018 parce qu'ils
reclassent ClinVar avec ClinVar. InterVar, lui, les pose encore — c'est une bonne part
de l'écart quand son verdict est plus tranché que les critères de la première liste.

Un critère n'est posé **que si sa source a répondu** : gnomAD en panne ne doit jamais
produire un « absente de gnomAD », qui serait PM2 posé sur une panne. Tant qu'une source
est en vol, le panneau dit laquelle.

### Cocher, décocher

Chaque critère porte une **case**, y compris ceux que l'application pose elle-même. Les
critères étayés arrivent **cochés** — c'est ce que l'application affirme, et il faut
pouvoir le lui retirer : un `PM1` dont le point chaud n'est pas vérifié, par exemple.
Les critères conditionnels et ceux à préciser arrivent décochés : personne ne les a
encore posés.

L'état appartient à l'analyse en cours : une case cochée ne se décoche pas parce qu'une
source vient de répondre, ni parce qu'on passe en anglais. Une nouvelle analyse le remet
à zéro, avec le reste de l'écran.

Le bouton **Copier les critères** rend une ligne par critère **coché**, avec le fait qui
le porte quand il y en a un. Un critère conditionnel coché l'a été par le biologiste : il
ne porte donc plus de marque de doute.

### Pourquoi pas une classe calculée

Pondérer ces critères demande la spécification du gène (VCEP ClinGen quand il en existe
une), le mécanisme de la maladie et souvent le contexte du patient. Les seuils eux-mêmes
en dépendent : BA1 vaut 1,5 % pour CFTR et 5 % par défaut, BS1 n'a pas de valeur
générale. Un verdict calculé ici serait une opinion de plus, présentée comme un résultat.

Le panneau renvoie au référentiel français qui, lui, tranche : [ANPGM / Réseau NGS-Diag
— *Interprétation des variants*](https://anpgm.fr/media/documents/BP-NGSDiag_001_Interpretation_Variants_v2.pdf)
(document NGSDIAG_001, version 2, révisée le 11/02/2021). C'est lui qui fixe, pour les
comptes rendus que cette page sert à écrire, l'usage des fréquences alléliques, des
données prédictives, de la ségrégation et des données fonctionnelles, puis la
classification elle-même.

Côté API, [GeneBe](https://genebe.net/) rend bien des critères ACMG avec leurs
modulateurs de force et le score en points, mais refuse les appels navigateur
(`403 Invalid CORS request` dès qu'un en-tête `Origin` est présent, vérifié le
16/11/2026) : inutilisable depuis une page statique, voir [docs/cors.md](docs/cors.md).

## Épisignature Epi2Diag

Sur la ligne **Gène** de l'encart d'identité, une étiquette **Épisignature Epi2Diag**
apparaît quand le gène figure dans la liste des épisignatures suivies par le projet
[Epi2Diag](https://docs.google.com/forms/d/e/1FAIpQLSe2fOIRUvuwLdnEAwX7u1uLxLzE_WheHeLyKxn5XgxkPrW5mA/viewform)
— 42 lignes, 42 symboles de gènes, liste de **septembre 2026**. Elle répond à une question que ni
ClinVar ni les prédicteurs ne tranchent : *cette VSI peut-elle être départagée par une
épisignature, et dans quel délai ?*

L'étiquette seule ne suffirait pas — une signature validée sur 32 témoins positifs et
une signature qui attend encore les siens n'autorisent pas la même conclusion. Trois
lignes la suivent donc : le syndrome et le niveau d'exploitabilité, les chiffres sur
lesquels il repose, et le périmètre au-delà duquel il cesse de valoir.

| Couleur | État | Lecture |
|---|---|---|
| vert | analyse de VSI possible au titre de la recherche | 14 lignes |
| ocre | analyse possible, témoins positifs complémentaires requis | 22 lignes |
| gris | témoins positifs nécessaires | 6 lignes — la signature n'est pas encore exploitable |

> **ANKRD11** `Épisignature Epi2Diag`
> KBG syndrome — analyse de VSI possible au titre de la recherche
> 23 témoins positifs · sensibilité 91 % · liste Epi2Diag, sept. 2026

Les chiffres sont toujours affichés **avec la date de la liste** : ils bougent à chaque
témoin positif analysé. En face d'une classe **4 ou 5**, une ligne ajoute que le projet
recherche des échantillons dans ce gène — c'est à cette lecture-là que l'information
devient actionnable.

**Périmètre.** Quand la liste borne la validité de la signature, la limite est écrite :
`SMC1A` faux-sens seulement, `KDM5C` signature inverse dans le linker ARID-PHD1
N-terminal, `RNU2-2` variation `n.4` seulement, `RNU4-2` signal plus fort pour la
T-loop. **ADNP** porte deux signatures que la position c. départage — la région
centrale `c.2000-2340` est exploitable, les extrémités attendent leurs témoins ; une
variation dont la position c. n'est pas déterminable (intronique, UTR) laisse les deux
lignes affichées plutôt qu'un périmètre affirmé à tort.

**Symboles.** L'appariement se fait sur le symbole HGNC, alias compris. La feuille écrit
`KMT6A` en face du syndrome de Kabuki : c'est **KDM6A** qui est retenu — `KMT6A` est le
synonyme officiel d'*EZH2* (syndrome de Weaver), qui n'a pas de signature dans cette
liste et n'est donc pas étiqueté. Seize lignes de la feuille ne nomment pas de
syndrome ; l'étiquette commence alors par l'état.

L'absence d'étiquette **n'affirme rien** : la liste est celle d'un projet, pas celle de
la littérature entière.

## Écarts avec la macro

**Corrigé** (demandé par la spécification) — la phrase de conservation.
Dans `comment.GetComment`, le test `If var_type = "missense"` arrive **après** le
`Select Case` qui a remplacé `var_type` par « variation faux-sens » : la phrase ne
sortait donc jamais. Et `var_conservation` était construite même quand le résidu
n'était pas conservé, ce qui produisait « résidu  au cours de l'évolution ».
Ici, la phrase n'est écrite que si **faux-sens ET GERP conservé ET phyloP > 4**.

**Corrigé par changement de source** :
- **SpliceAI** — la macro découpe la réponse avec `Split(…, "|")(1)`, un format que
  l'API ne renvoie plus : le bouton est inopérant. Le score retenu ici est le
  **maximum des quatre delta scores** (gain/perte, accepteur/donneur).
- **Signification ClinVar** — la macro la lisait dans la colonne SOPHiA
  `clinvar_significance`. Elle est ici **agrégée à partir des RCV** de MyVariant
  (pathogène / probablement pathogène / conflits → incertaine, etc.).
- **Brin négatif** — pour une saisie HGVS `c.` sur un gène du brin −, VEP renvoie les
  allèles dans le sens du transcrit. Ils sont complémentés pour que le pseudo-VCF,
  gnomAD, SpliceAI et InterVar reçoivent bien les allèles génomiques.
- **Alignement des indels** — HGVS décale un indel vers la **droite** dans une
  répétition, VCF l'aligne à **gauche**. Les deux formes sont donc calculées : la forme
  alignée à gauche pour gnomAD, MyVariant, SpliceAI, InterVar et les liens ; la forme
  HGVS pour la nomenclature du compte rendu. Sans cette étape, `p.Phe508del` sortait en
  `7-117559591-TCTT-T`, introuvable dans gnomAD, et le commentaire annonçait une
  variation « absente des bases de données de populations contrôle » pour la variation
  CF la plus fréquente (forme correcte `7-117559590-ATCT-A`, AF ≈ 1,19 %).
  Une saisie pseudo-VCF non normalisée est corrigée de la même façon.
- **HGVS génomique** — la macro écrivait `g.{pos}{ref}>{alt}`, ce qui donne
  `g.117559589CATCT>C` pour un indel. La notation HGVS correcte est utilisée ici
  (`g.117559592_117559594del`).
- **Parenthèses du `p.`** — la nomenclature du compte rendu écrit `p.(Arg175His)`,
  là où la macro reprenait le `p.Arg175His` de sa source. Les parenthèses HGVS
  disent « déduit, non observé », ce qu'est toute conséquence protéique calculée à
  partir d'une variation nucléotidique. La première ligne du commentaire diffère donc
  de celle de la macro par ces deux caractères.
- **Liste de prédictions vide** — la macro pouvait écrire « discordants (délétère :  ;
  toléré : SpliceAI) ». Une liste vide n'est plus écrite. **Le verdict lui-même n'a pas
  été touché.**
- Le bouton VEP de la macro appelle `VEP_url()`, **fonction absente du projet** ;
  le lien est reconstruit sur le modèle du lien VEP-splice.

**Conservé volontairement**, pour que la comparaison avec les commentaires déjà
validés reste sans bruit cosmétique :
- le texte HAS de la classe 3 est repris **mot pour mot**, y compris le double espace
  dans « de classe 3  ne doivent pas » et l'accord « ne doivent pas être utilisés » ;
- la phrase du domaine protéique n'a **pas** de point final, comme dans la macro ;
- la règle de verdict des prédictions reproduit `UBound(Split(…, ","))` : une liste
  d'**un seul** outil et une liste **vide** y valent toutes deux 0, donc un seul outil
  délétère face à zéro toléré ne donne pas « pathogène » mais « discordant ».

Ces trois points sont faciles à changer (`js/comment.js`) si vous le souhaitez.

### Verdict des prédictions — corrigé

Trois changements dans `predictionVerdict()` (`js/comment.js`) :

1. **`concordant_del`** exigeait que **REVEL ou MetaLR** soit délétère. Ces deux
   méta-prédicteurs ne notent que les faux-sens : pour un non-sens, un frameshift ou un
   variation d'épissage ils valent toujours `n.a.`, et le verdict retombait donc
   **systématiquement sur « discordants »**, même avec CADD et SpliceAI tous deux
   délétères. La concordance n'est maintenant exigée que si au moins un des deux est
   réellement disponible. BRCA1 `c.5467+1G>A` (SpliceAI 0,93 ; CADD 32) passe ainsi de
   « discordants » à « en faveur du caractère pathogène ».
2. **Comptage** : `UBound(Split(s, ","))` vaut 0 pour une liste vide **comme** pour une
   liste à un seul outil ; un outil délétère ne gagnait donc jamais contre zéro toléré.
   Les listes sont comparées par leur longueur réelle.
3. **Garde-fou** (`MIN_TOOLS_FOR_DIRECTION = 2`) : il faut au moins deux outils du côté
   gagnant pour affirmer une direction. Sans lui, la correction n° 2 faisait ressortir
   `p.Phe508del` — seul SpliceAI noté, à 0,01 — comme « en faveur du caractère bénin »
   dans un compte rendu de classe 5. Mettre la constante à `1` pour revenir à la simple
   comparaison des effectifs.

Inchangé : si REVEL et MetaLR sont tous deux disponibles et se contredisent, le verdict
reste « discordants » (MTHFR `c.665C>T`).

**Différences de fond à connaître** :
- La macro écrivait la fréquence depuis **gnomAD v2.1.1**. Ici le commentaire utilise
  **v4.1** par défaut ; le sélecteur du panneau *Clés API* permet de repasser en
  v2.1.1 pour reproduire exactement une ancienne sortie. Les deux versions sont
  toujours affichées dans le tableau.
- Sans clé OMIM, la liste des phénotypes vient de Monarch : l'ordre n'est pas celui
  d'OMIM et la transmission peut manquer pour certaines entrées.
- **Mode de transmission plus souvent renseigné.** La transmission est lue dans un
  appel Monarch groupé (`predicate=biolink:has_mode_of_inheritance`) et non plus dans
  l'objet `inheritance` d'une fiche `/entity`, souvent vide. Elle est donc trouvée
  **plus souvent** : trois phénotypes de contrôle passent de « ? » à « AD »
  (*hereditary breast carcinoma*, *familial pancreatic carcinoma*,
  *breast-ovarian cancer … 1*) et le commentaire gagne « de transmission autosomique
  dominante ». C'est le seul écart de sortie introduit par l'optimisation de latence
  ([docs/latence.md](docs/latence.md) § 3e) ; il est **conservé volontairement**, la
  donnée ajoutée étant correcte. Les comptes rendus de ces gènes ne sont donc plus
  comparables au caractère près avec ceux déjà produits par la macro.
- Les champs dbNSFP sont des tableaux (une valeur par transcrit). La première valeur
  est retenue, comme dans la macro ; l'interface signale les valeurs discordantes.

## Vérification

```bash
node tools/test-comment.mjs                                     # commentaire, sans réseau
node tools/test-structure.mjs                                   # géométrie exonique, sans réseau
node tools/test-episignatures.mjs                               # liste Epi2Diag, sans réseau
node tools/validate.mjs "chr17-7675088-C-T:5"
node tools/validate.mjs --lang en --links "NM_000546.6:c.524G>A:4"
node tools/validate.mjs --gnomad v2.1.1 "chr17-7675088-C-T:5"   # comme la macro
```

`tools/test-comment.mjs` exerce les dix sections du commentaire en FR et EN sans
appel réseau. `tools/test-structure.mjs` vérifie la géométrie exonique sur des
enregistrements UCSC réels des deux brins : numérotation, distances aux jonctions
(recoupées avec les décalages de la nomenclature HGVS), indels dont la base d'ancrage
n'est pas touchée, variation à cheval sur une jonction, et décalage de version du
transcrit. `tools/test-episignatures.mjs` contrôle la table Epi2Diag recopiée à la
main — effectifs, sensibilités, répartition par état — l'appariement par alias, le
départage des deux signatures d'ADNP par la position c., et les phrases rendues en
FR et EN. Les passages sur variations réelles sont dans
[docs/validation.md](docs/validation.md), et la comparaison avant/après l'optimisation
de latence dans [docs/latence.md](docs/latence.md) § 5.

Même chaîne que la page (`js/` est partagé), affichage des chiffres, des liens et du
commentaire. Clés par variables d'environnement : `OMIM_KEY`, `MOBIDETAILS_KEY`.

## Structure

```
index.html          page
css/app.css         styles
js/util.js          réseau (réessais), nombres
js/sources.js       clients des API
js/variant.js       saisie → variation normalisée (VEP)
js/annotate.js      chiffres et seuils
js/comment.js       commentaire FR/EN
js/links.js         liens
js/structure.js     structure exonique et distance aux jonctions
js/episignatures.js liste Epi2Diag : quels gènes ont une épisignature exploitable
js/schema.js        les deux schémas SVG
js/i18n.js          libellés de l'interface
js/app.js           câblage
tools/validate.mjs  chaîne complète en ligne de commande
tools/test-comment.mjs  tests du commentaire, sans réseau
tools/test-structure.mjs  tests de la géométrie exonique, sans réseau
tools/test-episignatures.mjs  tests de la liste Epi2Diag, sans réseau
docs/cors.md        tests CORS
docs/ensembl.md     choix de l'endpoint VEP et solutions de repli
docs/validation.md  vérifications
docs/latence.md     profil et optimisation du temps d'analyse
```

Aucune donnée patient ne transite : seules les coordonnées de la variation sont envoyées
aux services interrogés.
