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
| UniProt, HGNC | mygene.info |
| NCBI GeneID (PubTator) | NCBI E-utilities |
| Phénotypes, MIM, transmission | OMIM (avec clé) ou Monarch |

Le détail des tests CORS — et la liste de ce qui reste en **lien seul** — est dans
[docs/cors.md](docs/cors.md). En résumé : seuls **CADD**, **OMIM** et **Orphanet**
refusent les appels depuis une page web. Le score CADD phred vient donc de MyVariant
(le même champ que lisait la macro) et le bouton CADD reste un lien.

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

**Différences de fond à connaître** :
- La macro écrivait la fréquence depuis **gnomAD v2.1.1**. Ici le commentaire utilise
  **v4.1** par défaut ; le sélecteur du panneau *Clés API* permet de repasser en
  v2.1.1 pour reproduire exactement une ancienne sortie. Les deux versions sont
  toujours affichées dans le tableau.
- Sans clé OMIM, la liste des phénotypes vient de Monarch : l'ordre n'est pas celui
  d'OMIM et la transmission peut manquer pour certaines entrées.
- Les champs dbNSFP sont des tableaux (une valeur par transcrit). La première valeur
  est retenue, comme dans la macro ; l'interface signale les valeurs discordantes.

## Vérification hors navigateur

```bash
node tools/validate.mjs "chr17-7675088-C-T:5"
node tools/validate.mjs --lang en --links "NM_000546.6:c.524G>A:4"
node tools/validate.mjs --gnomad v2.1.1 "chr17-7675088-C-T:5"   # comme la macro
```

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
tools/validate.mjs  vérification en ligne de commande
docs/cors.md        tests CORS
```

Aucune donnée patient ne transite : seules les coordonnées du variant sont envoyées
aux services interrogés.
