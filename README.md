# variant-toolbox

Version web de la **ToolBox SNV** de `MacroCES_Web.xlsm` : saisie d'un variant,
récupération des chiffres, liens vers les bases, et rédaction du commentaire en
français ou en anglais.

Page statique, sans étape de build, hébergée sur GitHub Pages.
→ **https://jimouse.github.io/variant-toolbox/**

## Utilisation

1. Saisir le variant, sous l'une des deux formes :
   - HGVS sur transcrit RefSeq — `NM_000546.6:c.524G>A` (le gène entre parenthèses
     est accepté : `NM_000546.6(TP53):c.524G>A`) ;
   - pseudo-VCF hg38 — `chr17-7675088-C-T` (`17:7675088:C:T` fonctionne aussi).
2. Choisir la classe (3, 4 ou 5).
3. **Analyser.** Les chiffres, les liens et le commentaire s'affichent ;
   le bouton **Copier** met le commentaire dans le presse-papier.

Le choix du **transcrit** suit la saisie : une entrée VCF utilise le transcrit
**MANE Select**, une entrée HGVS utilise le transcrit saisi, avec une indication
MANE oui/non (et le transcrit MANE rappelé si ce n'est pas celui-là).

**Langue** : détectée depuis le navigateur, bouton FR/EN, choix mémorisé.
Le commentaire suit la langue de l'interface.

On peut aussi partager un variant par l'URL :
`?v=chr17-7675088-C-T&class=5&lang=fr`

## Clés API

Saisies dans le panneau **Clés API**, stockées **uniquement dans le navigateur**
(`localStorage`) et jamais dans le dépôt.

| Clé | Avec la clé | Sans la clé |
|---|---|---|
| **OMIM** | phénotypes et transmission depuis l'API OMIM | repli sur Monarch (nom, numéro MIM, transmission) |
| **MobiDetails** | création/lecture de l'identifiant et lien vers la fiche du variant | lien vers la page d'accueil |

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
| gnomAD v4.1 exomes + génomes (AC, htz, hmz, AF) | API GraphQL gnomAD |
| gnomAD v2.1.1 exomes | MyVariant.info (`gnomad_exome`) |
| SIFT, PolyPhen-2, AlphaMissense, REVEL, MetaLR, CADD, GERP++, phyloP, phastCons, InterPro | MyVariant.info (`dbnsfp`) |
| SpliceAI | services Cloud Run de SpliceAI-lookup (hg38) |
| ClinVar (signification agrégée + accessions RCV) | MyVariant.info (`clinvar`) |
| InterVar + critères ACMG | API wInterVar |
| UniProt, HGNC, MIM du gène, NCBI GeneID | genenames.org (HGNC), repli mygene.info + E-utilities |
| Phénotypes, MIM, transmission | OMIM (avec clé) ou Monarch |

Le détail des tests CORS — et la liste de ce qui reste en **lien seul** — est dans
[docs/cors.md](docs/cors.md). En résumé : seuls **CADD**, **OMIM** et **Orphanet**
refusent les appels depuis une page web. Le score CADD phred vient donc de MyVariant
(le même champ que lisait la macro) et le bouton CADD reste un lien.

**Ensembl** : les deux formes de saisie passent par `GET /vep/human/hgvs`, mesuré à
14/14 là où `GET /vep/human/region` échoue 8 fois sur 14. Ensembl ne tombe pas
franchement, il **laisse pendre la connexion** : VEP est donc lancé avec un délai de
8 s et sans réessai, et si rien n'est revenu au bout de 200 ms **VariantValidator est
lancé en parallèle**, la première réponse gagnant la course. La séquence de référence
bascule de même sur l'**API REST d'UCSC**. Une analyse qui prenait 103 s pendant un
épisode de lenteur en prend 1,4. L'interface affiche un compteur d'avancement et
plafonne chaque étape à 60 s. Mesures et limites : [docs/ensembl.md](docs/ensembl.md).

## Temps d'analyse

| Situation | Durée |
|---|---|
| VEP répond (cas normal, ~39 ms) | **380–620 ms** |
| Ensembl **en panne**, repli VariantValidator | **801 ms** de médiane, 16 analyses sur 24 sous la seconde |

Profil détaillé, latence mesurée de chaque service et les huit corrections qui ont fait
passer l'analyse de 7,8–8,9 s à moins d'une seconde : [docs/latence.md](docs/latence.md).

Trois d'entre elles pèsent le plus : la course VEP/VariantValidator ne perd plus 2,5 s
en attente morte, la chaîne des phénotypes tourne **en parallèle** des autres sources
au lieu de les suivre, et `genenames.org` remplace en un appel de 38 ms la paire
mygene.info + E-utilities qui coûtait 1,4 s. La page ouvre aussi ses connexions TLS
**pendant la saisie** (`warmUp`) : la seule poignée de main de MyVariant coûte 1,3 s.

## Seuils

Ceux de la macro : CADD > 15, REVEL > 0,5, SpliceAI > 0,5, GERP ≥ 2 = conservé,
AlphaMissense `B` = toléré, SIFT/PolyPhen-2/MetaLR `T`/`B` = toléré et `D`/`P`/`A` = délétère.
Vert = toléré, rouge = délétère.

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
   variant d'épissage ils valent toujours `n.a.`, et le verdict retombait donc
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
node tools/test-comment.mjs                                     # 46 contrôles, sans réseau
node tools/validate.mjs "chr17-7675088-C-T:5"
node tools/validate.mjs --lang en --links "NM_000546.6:c.524G>A:4"
node tools/validate.mjs --gnomad v2.1.1 "chr17-7675088-C-T:5"   # comme la macro
```

`tools/test-comment.mjs` exerce les dix sections du commentaire en FR et EN sans
appel réseau. Les passages sur variants réels sont dans
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
js/variant.js       saisie → variant normalisé (VEP)
js/annotate.js      chiffres et seuils
js/comment.js       commentaire FR/EN
js/links.js         liens
js/i18n.js          libellés de l'interface
js/app.js           câblage
tools/validate.mjs  chaîne complète en ligne de commande
tools/test-comment.mjs  tests du commentaire, sans réseau
docs/cors.md        tests CORS
docs/ensembl.md     choix de l'endpoint VEP et solutions de repli
docs/validation.md  vérifications
docs/latence.md     profil et optimisation du temps d'analyse
```

Aucune donnée patient ne transite : seules les coordonnées du variant sont envoyées
aux services interrogés.
