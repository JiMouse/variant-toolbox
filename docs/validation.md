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
