# Latence : d'où venaient les 7 secondes

Écrit après une analyse de profil le 09/11/2026, l'application rendant un compte rendu
en **7,8 à 8,9 s**. Toutes les mesures ci-dessous sont faites en instrumentant `fetch`
dans la chaîne réelle (`js/` est partagé avec la page), pas sur un banc séparé.

## 1. Le profil de départ

Trace d'une analyse de `chr17-7675088-C-T` (TP53 `c.524G>A`), colonne `début` = ms
depuis le lancement :

```
début   durée  service
    0     160  rest.ensembl          500
  974     126  rest.ensembl          500      ← réessai 1
 2508    1449  variantvalidator      200      ← la course démarre enfin
 2697     135  rest.ensembl          500      ← réessai 2
 3963     221  variantvalidator      gene2transcripts (199 KiB)
 4308    2054  myvariant             fields=all (103 KiB)
 4313    1678  wintervar
 4315    1593  mygene
 4316     151  eutils
 6367     400  monarch  association            ← ne démarre qu'après settleAll
 6917     706  monarch  entity × 6
```

Trois **étages successifs** qui s'additionnent, là où presque tout pouvait être simultané :

| Étage | Coût | Cause |
|---|---|---|
| normalisation | 4,3 s | attente morte avant le repli (ci-dessous) |
| sources en parallèle | 2,1–3,4 s | plafonné par MyVariant et mygene |
| phénotypes | 1,0–1,2 s | chaîne lancée **après** la fin des autres |

## 2. Latence réelle de chaque service

Médiane sur 8 appels, connexion déjà ouverte :

| Service | Médiane | Min | Max |
|---|---|---|---|
| `rest.ensembl.org` VEP | **39 ms** | 34 | 214 |
| genenames.org | **38 ms** | 34 | 108 |
| wInterVar | **99 ms** | 98 | 365 |
| SpliceAI (Cloud Run) | 169 ms | 161 | 227 |
| Monarch association | 225 ms | 212 | 573 |
| VariantValidator | 1 323 ms | 1 173 | 1 440 |
| MyVariant `fields=all` | 1 628 ms | 737 | 1 906 |
| mygene.info | 1 478 ms | — | — |

Rien ne justifiait 8 s : la somme des médianes du chemin critique faisait moins de 2 s.
Et **VEP répond en 39 ms** quand il va bien — le même appel ayant par ailleurs été
mesuré à 23,8 s et 51,3 s pendant un épisode de lenteur (voir [ensembl.md](ensembl.md)).

## 3. Les huit corrections

### a. L'attente morte avant le repli — ~2,4 s

`hedge()` lançait VariantValidator au bout de **2 500 ms**. Or :

- VEP sain répond en 39 ms : 2,5 s n'était pas une marge, c'était du temps perdu ;
- `vepHgvs` portait `retries: 2`. Un `500` **connu dès 160 ms** n'était donc signalé à
  `hedge` qu'au bout de 2,8 s, après trois tentatives et deux paliers d'attente — et
  le chemin « échec avant le délai : ne pas attendre » de `hedge` ne servait jamais.

→ `retries: 0` sur VEP (le repli est VariantValidator, pas un réessai d'Ensembl) et
délai de course ramené à **200 ms**. Un `500` franc fait maintenant basculer
immédiatement : normalisation mesurée à **144–268 ms** sur repli, contre 4,3 s.

### b. `fields=all` sur MyVariant — ~500 ms et 93 KiB

103 KiB par appel, dont **68 KiB de `snpeff`**, champ que le code ne lit jamais. Les 20
chemins réellement lus tiennent en 10 KiB.

| | Taille | Médiane |
|---|---|---|
| `fields=all` | 102,8 KiB | 1 003 ms |
| liste restreinte | 9,7 KiB | 568 ms |

⚠ **Piège vérifié** : le paramètre `fields` de MyVariant **ne sait pas viser
`dbnsfp.gerp++.rs`**. Le `+` est ignoré et la réponse contient alors
`dbnsfp.gerp.91_mammals` — soit **5,48** au lieu de **5,41**, une *autre* mesure de
conservation, donc un autre verdict possible au seuil de 2. Le joker **`dbnsfp.gerp*`**
ramène bien `gerp++`. Équivalence contrôlée champ par champ (les 20 chemins lus, sur
6 variants) : **aucun écart**.

### c. La chaîne des phénotypes, lancée après tout le reste — ~1,2 s

`buildPhenotypes()` était appelé **après** `settleAll`, donc après la plus lente des
sources, alors qu'il ne dépend que de l'identifiant HGNC du gène — connu dès la
normalisation. Elle est maintenant une tâche du même bloc parallèle et tient
entièrement sous le temps de MyVariant.

### d. mygene.info + E-utilities → genenames.org — ~1,4 s

Les deux appels ne servaient qu'à quatre valeurs : HGNC, UniProt, MIM du gène, GeneID
NCBI. `rest.genenames.org/fetch/symbol/{gène}` les donne **toutes les quatre en un
appel de 38 ms**, avec `Access-Control-Allow-Origin: *`.

Valeurs comparées sur TP53, BRCA1, CFTR et MTHFR : **identiques champ par champ**.
En prime, E-utilities limite à 3 requêtes/s sans clé — observé en échec au 5ᵉ appel
d'affilée. mygene + E-utilities restent en repli si genenames ne connaît pas le gène.

### e. Monarch : 1 + N appels → 2 — ~0,8 s

Le mode de transmission demandait un `GET /entity/{MONDO}` par maladie (6 pour TP53,
750 ms et 15 KiB chacun). Deux trouvailles :

- l'association porte **déjà** le numéro MIM dans `original_object` (`OMIM:114480`) ;
- `/association` accepte `subject` **répété** : un appel de ~210 ms avec
  `predicate=biolink:has_mode_of_inheritance` rend la transmission de **toutes** les
  maladies.

Les fiches `/entity` ne sont plus demandées que pour les maladies dont
`original_object` ne porte pas de MIM (0 appel sur TP53, CFTR, DMD ; 1 sur BRCA1) :
aucun MIM n'est perdu.

**Changement de sortie** — l'appel groupé trouve la transmission **plus souvent** que
l'objet `inheritance` d'une fiche `/entity`, souvent vide. Sur les variants de contrôle,
trois phénotypes passent de « ? » à « AD » (*hereditary breast carcinoma*,
*familial pancreatic carcinoma*, *breast-ovarian cancer … 1*) et le commentaire gagne
donc « de transmission autosomique dominante ». C'est le **seul** écart de sortie de
tout ce travail (voir § 5).

### f. Les blocages par connexion suspendue

Trois services laissent pendre la connexion au lieu de refuser, et la chaîne payait
l'expiration complète :

- **MyVariant** — observé suspendu 8 s puis réessai abouti en 1,7 s, soit 10,5 s pour
  une donnée normalement rendue en 350 ms. La requête est maintenant **doublée** si
  rien n'est revenu au bout de 1,5 s, première réponse gagnante (`hedge`, un GET
  idempotent). Délai 12 s → 8 s.
- **SpliceAI** — les deux services Cloud Run étaient essayés **en série**, 25 s chacun
  (un démarrage à froid le demande) : 50 s à eux seuls dans le pire cas. Ils sont
  maintenant **en course**, le second partant au bout de 3 s.
- **wInterVar** — délai 12 s → 8 s (mesuré à 99 ms à chaud, 1,5 s au pire).

### g. Le coût d'ouverture des connexions — ~1,3 s dans le navigateur

Invisible en ligne de commande, décisif dans la page. Première requête vers un hôte
neuf, décomposée :

| Service | DNS | TCP | TLS | **ouverture** |
|---|---|---|---|---|
| **myvariant.info** | 4 ms | 237 ms | **1 041 ms** | **1 282 ms** |
| wintervar.wglab.org | 5 ms | 324 ms | 209 ms | 538 ms |
| api.monarchinitiative.org | 4 ms | 119 ms | 126 ms | 249 ms |
| rest.ensembl.org | 6 ms | 26 ms | 64 ms | 97 ms |
| rest.genenames.org | 4 ms | 12 ms | 24 ms | 40 ms |

La seule poignée de main TLS de MyVariant coûte plus d'une seconde. D'où :

- `dns-prefetch` dans le `<head>` pour les huit origines (coût nul, cache DNS long) ;
- `warmUp()` (`js/app.js`) pose les `preconnect` **au premier contact avec le champ de
  saisie** — donc pendant que le variant est tapé. Un `preconnect` placé dans le
  `<head>` serait inutile : le navigateur ferme une connexion préouverte restée
  inutilisée au bout d'une dizaine de secondes, bien avant qu'un variant soit saisi.

### h. `gene2transcripts` sorti du chemin critique — 0,2 à 1,3 s

Sur le repli VariantValidator, le total d'exons (« 5/**11** ») demande un second appel
de **199 KiB**, le total ne figurant nulle part dans la réponse principale. Il était
**sériel** après la validation (mesuré jusqu'à 1 276 ms). `exonTotal()` est maintenant
une tâche du bloc parallèle d'`annotate()` : `normalize()` renvoie « 5 » et `annotate()`
le complète en « 5/11 ». Contrôlé : `exon 5/11`, `exon 11/27`, `intron 22/22`.

## 4. Résultat

```
début   durée  service
    0      41  rest.ensembl          200  VEP
   41      80  rest.genenames        200
   42     963  myvariant             200  (10 KiB)
   43     152  gnomad
   44     210  spliceai
   45     584  wintervar
  120     398  monarch  association
  520     394  monarch  inheritance (groupée)
```

Un seul étage reste : la normalisation, puis **tout le reste en parallèle**.

| | Avant | Après |
|---|---|---|
| Ensembl sain, connexions chaudes | 7,8–8,9 s | **380–620 ms** |
| Ensembl **en panne** (repli VariantValidator) | 7,8–8,9 s | **801 ms** de médiane |
| MyVariant suspendu | 10,5 s | ~3,2 s |
| SpliceAI en démarrage à froid | jusqu'à 50 s | ~3 s |

La deuxième ligne est mesurée sur 24 analyses (8 variants × 3 passes) pendant un
épisode où **les 24 sont passées par le repli**, Ensembl ne répondant plus du tout :
min 668 ms, médiane **801 ms**, max 2 102 ms, **16 sur 24 sous la seconde**. Le seuil
d'une seconde est donc tenu à la médiane *même sans Ensembl*, et largement quand VEP
répond (39 ms).

Les deux cas qui dépassent encore :

- **saisie pseudo-VCF** (`chr17-7675088-C-T`) — normalisation à ~1,5 s. Interrogé par
  coordonnée génomique (`NC_000017.11:g.…`), VariantValidator met ~1,3 s, contre
  ~300 ms par HGVS de transcrit. C'est son coût à lui, pas celui de la chaîne ;
- **BRCA1 `c.5467+1G>A`** — ~1,7 s d'annotation : le gène porte des phénotypes dont
  `original_object` ne donne pas le MIM, d'où deux fiches `/entity` en plus (§ 3e).

## 5. Ce qui a été vérifié

- `node tools/test-comment.mjs` — 65 contrôles, sans réseau : **passants**.
- Sortie complète (`validate.mjs --links`, chiffres + 26 liens + commentaire) comparée
  **avant / après** sur 5 variants réels : TP53 `c.524G>A` (et sa forme pseudo-VCF),
  CFTR `p.Phe508del`, BRCA1 `c.5467+1G>A`, MTHFR `c.665C>T`.
  → 2 variants **identiques au caractère près** ; 3 ne diffèrent **que** par le mode de
  transmission trouvé en plus (§ 3e). Tous les chiffres, prédictions, scores de
  conservation, ClinVar, gnomAD, InterVar, domaines et liens sont inchangés.
- Équivalence des champs MyVariant restreints : 20 chemins × 6 variants, **aucun écart**.
- `chr13-32339132-C-T` échoue (`400` de VEP, avertissement de VariantValidator) —
  **avant comme après** : coordonnée inexistante, pas une régression.

## 6. Ce qui reste

**La course VEP / VariantValidator est réglée à 200 ms** (`VEP_HEDGE_DELAY`,
`js/variant.js`) — 5× la médiane de VEP. Le ramener à 0 mettrait la normalisation à
~200 ms dans tous les cas, au prix d'une requête VariantValidator à **chaque** analyse,
y compris celles où VEP gagne : service académique gratuit, l'arbitrage a été fait en
faveur des 200 ms.

**MyVariant.** ~500 ms de médiane une fois les champs restreints, et 1,3 s de poignée
de main TLS à froid : c'est le service le plus lent qui reste indispensable (dbNSFP,
CADD, ClinVar, gnomAD v2.1.1). Aucune source CORS équivalente n'a été trouvée.

*(L'affichage progressif, qui restait à faire, est décrit au § 7.)*

## 7. Affichage progressif

Le temps total ne bouge plus beaucoup ; le temps **perçu**, si. L'identité du variant est
connue dès la normalisation — avant tout appel aux bases — et les chiffres arrivent
ensuite par vagues. Chaque bloc est donc rendu dès qu'il est prêt.

### Mécanique

`settleAll(tasks, onSettled)` rappelle l'appelant à **chaque** source qui aboutit ou
échoue, avec l'état partiel et la liste de ce qui reste en vol. `annotate()` expose cela
par `onPartial`, en réassemblant le contexte à chaque fois : le même `assemble()` sert au
rendu intermédiaire et au rendu final, donc aucune logique n'est dupliquée. Le premier
`onPartial` est émis **avant** le premier appel réseau.

```
[  40 ms] identité affichée      gène, transcrit, MANE, conséquence, HGVS c./p./g., exon
[ 438 ms] MyVariant              CADD, REVEL, MetaLR, AlphaMissense, SIFT, PolyPhen, ClinVar, conservation
[ 509 ms] InterVar               classe ACMG + critères
[ 597 ms] SpliceAI               score d'épissage
[ 671 ms] VariantValidator       « exon 5 » → « exon 5/11 »
[1037 ms] Monarch                phénotypes, MIM, transmission → commentaire rédigé
```

### « n.a. » n'est pas « pas encore arrivé »

C'est le point délicat, et il est clinique : **`n.a.` affirme que la base a répondu et
ne connaît pas ce variant.** L'afficher pendant que la requête est en vol serait un
contresens — un score de prédiction absent n'a pas le même poids qu'un score pas encore
reçu. Chaque champ est donc rattaché à la source qui le fournit (`isPending()`), et tant
qu'elle n'a pas répondu la valeur s'affiche « … » avec une pulsation discrète
(`@keyframes breathe`, neutralisée sous `prefers-reduced-motion`). Cela vaut aussi pour
les liens : « données manquantes » n'apparaît qu'une fois la source revenue.

### Le commentaire, lui, n'est pas progressif

Volontairement. Une version partielle écrirait « absente des bases de données de
populations contrôle » simplement parce que gnomAD n'a pas encore répondu. Tant qu'une
source manque, la zone de texte affiche ce qui est attendu et **les boutons Copier et
Régénérer restent désactivés** : il n'est pas possible de copier un commentaire
incomplet. Le compteur d'avancement nomme les sources encore attendues
(« Interrogation des bases… (1 s) — en attente : InterVar, Monarch »).

Si le plafond de 60 s est atteint alors que des sources ont répondu, l'affichage est
**conservé** au lieu d'être effacé : l'identité et les chiffres obtenus restent lisibles,
et le commentaire reste non rédigé.

### Vérifié dans un vrai navigateur

Chrome sans interface, piloté par CDP sur la page servie en local, avec un
`MutationObserver` sur le bloc de résultats :

- 10 mutations, 6 états distincts observés pour une analyse de TP53 `c.524G>A` ;
- identité complète au premier rendu, 30 cellules en attente, Copier désactivé ;
- les sept lignes de prédiction présentes à la fin (SIFT, PolyPhen-2, CADD, REVEL,
  MetaLR, AlphaMissense, SpliceAI) ;
- Copier **re-désactivé** au lancement d'une seconde analyse (pas de fuite d'état),
  vérifié en échantillonnant le bouton toutes les 60 ms ;
- bascule FR/EN en cours d'affichage sans incident ;
- **aucune erreur console, aucune exception JS** sur l'ensemble des scénarios.
