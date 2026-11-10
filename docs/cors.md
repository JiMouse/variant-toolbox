# CORS — quels services répondent à une page web ?

Test effectué le 09/11/2026 depuis l'origine `https://jimouse.github.io`
(en-tête `Origin` + lecture de `Access-Control-Allow-Origin`, GET et préflight OPTIONS).

| Service | Endpoint testé | ACAO | Verdict |
|---|---|---|---|
| Ensembl VEP REST | `rest.ensembl.org/vep/human/{hgvs,region}` | `*` | ✅ **chiffres** (GET + POST) |
| MyVariant.info | `myvariant.info/v1/variant/…?assembly=hg38` | `*` | ✅ **chiffres** |
| mygene.info | `mygene.info/v3/query` | `*` | ✅ **chiffres** |
| gnomAD GraphQL | `gnomad.broadinstitute.org/api` | `*` | ✅ **chiffres** (v4.1 exomes + génomes) |
| SpliceAI | `spliceai-38-xwkwwwxdwq-uc.a.run.app/spliceai/` | `*` | ✅ **chiffres** — voir note |
| InterVar (wInterVar) | `wintervar.wglab.org/api_new.php` | `*` | ✅ **chiffres** (+ critères ACMG) |
| NCBI E-utilities | `eutils.ncbi.nlm.nih.gov/entrez/eutils/` | `*` | ✅ **chiffres** |
| Monarch Initiative | `api.monarchinitiative.org/v3/api/` | `*` | ✅ **chiffres** (source libre phénotypes) |
| MobiDetails | `mobidetails.chu-montpellier.fr/api/` | reflète l'origine | ✅ **chiffres** (avec clé) |
| UCSC (API REST) | `api.genome.ucsc.edu/getData/{track,sequence}` | `*` | ✅ **chiffres** (structure exonique, séquence de référence) |
| CADD | `cadd.gs.washington.edu/api/v1.0/GRCh38-v1.6/` | *aucun* | ❌ **lien seul** → CADD phred lu dans MyVariant |
| OMIM | `api.omim.org/api/entry` | *aucun* | ❌ **lien seul** → repli Monarch |
| Orphanet | `api.orphacode.org` | reflète l'origine, mais 401 | ❌ **lien seul** (clé requise) |

## Notes

**SpliceAI.** L'hôte documenté `spliceailookup-api.broadinstitute.org` ne répond plus
(connexion en timeout, DNS pourtant valide). L'interface officielle SpliceAI-lookup appelle
en réalité quatre services Cloud Run, dont `spliceai-38-xwkwwwxdwq-uc.a.run.app` (hg38) et sa
variante `-comprehensive`. Ces deux-là répondent avec `Access-Control-Allow-Origin: *`.
L'application interroge l'hôte documenté en premier, puis bascule sur Cloud Run.

**CADD.** Le service répond 200 mais **sans aucun en-tête CORS** : un navigateur refuse donc
la lecture de la réponse. Le score CADD phred vient de MyVariant (`dbnsfp.cadd.phred`),
identique au champ utilisé par la macro ; le bouton CADD reste un lien.

**OMIM.** Pas d'en-tête CORS, même avec une clé. L'application tente l'appel si une clé est
saisie (utile derrière un proxy) et retombe silencieusement sur Monarch en cas d'échec.
Monarch fournit le nom de la maladie, le numéro MIM (`mappings`) et le mode de transmission
(terme HPO `inheritance`) — de quoi écrire la phrase de phénotype sans clé OMIM.

**Ensembl** renvoie par intermittence des `503 Service Unavailable` sous charge :
les appels sont réessayés avec un délai croissant.

**UCSC.** Deux usages : `getData/sequence` comme repli de la séquence de référence quand
Ensembl est en panne, et `getData/track?track=ncbiRefSeq` pour la structure exonique du
transcrit. La requête de piste porte sur **une seule base** — l'API renvoie tout
enregistrement qui chevauche l'intervalle, donc le transcrit entier avec ses bornes
d'exons, son CDS et son brin, dès lors que la variation tombe dedans.
