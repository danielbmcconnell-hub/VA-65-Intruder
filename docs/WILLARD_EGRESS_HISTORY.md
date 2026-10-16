# Willard Egress: historical foundation and reconstruction boundaries

This mission is a **historical reconstruction incorporating dramatized elements**, built around the 1966 VA-65 nighttime encounter described in the user's development directive. It is not an archival reenactment, a confirmed MiG identification, or a claim that the generated combat events happened to the named crew.

## Foundation supplied by the user

The directive identifies VA-65 Fighting Tigers, an A-6A operating from USS **Constellation (CVA-64)**, pilot Lieutenant **R. S. Williams**, bombardier/navigator Lieutenant **J. E. Diselrod**, and an encounter near **Nam Dinh, North Vietnam, in 1966**. It describes an unidentified aircraft following the Intruder at night and the pilot deliberately entering an area of North Vietnamese antiaircraft fire, apparently disrupting the pursuer and permitting escape. The directive calls this maneuver the **Willard Egress**.

Those particulars are preserved as the user's stated foundation. No independently retrieved primary account was available during this implementation. In particular, the names and initials above have not been checked against a 1966 squadron report, cruise record or contemporary flight account. No specific day or month, authenticated individual aircraft number, confirmed kill, eyewitness quotation or enemy pilot identity is added. The preserved external A-6 model uses generic NL 502 markings; the briefing explicitly states that these are not an authenticated aircraft assignment for Williams and Diselrod. The encounter should not be described as independently verified by this development environment.

This separate 1966 reconstruction does not move the existing tribute to LTJG William S. McConnell, VA-65, USS Kitty Hawk, 1968–1969, into a different ship or year. Earlier missions, historical POW material and their source qualifications remain preserved.

## Source audit: what was actually read

| Material | Status and permitted use |
| --- | --- |
| User's “Willard Egress” directive | Read in full. Source of the incident summary, participants, year, location and carrier stated above; not an independent archival citation. |
| Supplied `assets/willard/media/MiG17PF_Willard_Egress_ATLAS.json` | Read directly. Describes a MiG-17PF artist impression, fictional serial `5123`, AI-rendered artwork, straight RGBA alpha, screen-space headings, exact frame rectangles and pivots, and approximate bank frames. |
| Supplied `assets/willard/media/README.md` | Read directly. Explicitly labels the artwork as AI generated and the interceptor identification as unconfirmed; explains the sixteen heading steps and three approximate banking states. Its external shape-reference links were not independently retrieved. |
| Existing project source documents | `AGENTS.md`, `README_START_HERE.md`, `docs/HISTORICAL_SOURCES.md` and the Milestone 2.4 report were read for preservation and existing historical boundaries. They contain no independently sourced Willard account. |
| Naval History and Heritage Command, *Dictionary of American Naval Aviation Squadrons*, Volume 1 | Appropriate research lead for a VA-65 chronology. Retrieval failed; no passage, page number or publication quotation is claimed to have been read. Candidate PDF paths are not validated citations. |

### Retrieval attempts and exact limitations

Normal TLS-verified Python `urllib` requests were attempted on 15 October 2026. No certificate checks were disabled, no proxy was bypassed, and no network configuration was changed.

- NHHC landing page: <https://www.history.navy.mil/research/histories/naval-aviation-history/dictionary-of-american-naval-aviation-squadrons-volume-1.html>.
- Candidate NHHC PDF: <https://www.history.navy.mil/content/dam/nhhc/research/histories/naval-aviation/dictionary-of-american-naval-aviation-squadrons-volume-1/pdfs/va64-105.pdf>.
- An alternative candidate ending `va64-93.pdf`, the site's home page, and the first PDF with a download query were also attempted.

Requests to `www.history.navy.mil` returned **HTTP 503**, served by Envoy, with an upstream TLS error containing `CERTIFICATE_VERIFY_FAILED`. The alternate hostname `history.navy.mil` returned a proxy-tunnel **403 Forbidden**. Google and DuckDuckGo searches for the exact phrase “Willard egress,” and the Wikipedia VA-65 page, were rejected at the proxy tunnel with **403 Forbidden**. These failed requests produced no readable historical account. A failed candidate URL does not establish whether the requested publication or path exists.

For independent corroboration, obtain the NHHC VA-65 squadron chronology and the 1966 VA-65/Constellation command-history or cruise records, then confirm the crew's names, spelling, ranks, incident date and wording. The supplied account is adequate inspiration for a clearly labeled reconstruction; it is not a substitute for that source check.

## What the player sees versus what is established

| Element | Historical/reconstruction boundary |
| --- | --- |
| Heavy A-6A attack aircraft trying to escape a pursuing interceptor | User-supplied historical premise. Existing A-6A flight model is preserved; the player does not receive an internal gun or fighter handling. |
| VA-65, Constellation, Williams/Diselrod, Nam Dinh, 1966 | User-supplied identification pending independent source verification. No narrower date is asserted. |
| Pursuer represented as **MiG-17PF Fresco-D** | Explicitly plausible but **unconfirmed** representation of the unidentified interceptor. Do not call it the proven aircraft type. |
| Red serial **5123**, specific markings and exact aircraft appearance | Fictional details already disclosed by the supplied asset pack. No historical aircraft identity is implied. |
| Aircraft artwork and bank animation | Supplied **AI-rendered game art**, not a historical photograph or dimensionally exact model. The heading/bank sprites are two-dimensional foreshortening approximations, not physically accurate 3D geometry. Perspective placement does not change that limitation. |
| Cannon bursts, impact locations, evasive turns, damage, overshoots and break-off | Authored gameplay simulation, not a record of individual shots or maneuvers flown in 1966. No invented missile armament is attributed to the depicted interceptor. |
| Flak batteries, searchlights, villages, terrain, weather and night lighting | Representative fictional arrangement for readable gameplay; not a surveyed map or verified defense order of battle. Ground fire remains hostile and can endanger either aircraft. |
| Optional bombing pass, five phases, timing, checkpoints, difficulty and score | Game structure, compressed for play. No claim that these exact phases or times describe the real sortie. |
| B/N and pilot radio calls, including urgent warnings and post-escape lines | **Dramatized dialogue written for the game**. Do not present these lines as authentic Williams/Diselrod quotations or archival audio. |
| Successful escape, failure, ejection, rescue, capture and other player outcomes | Conditional gameplay outcomes. A generated MiG loss or any other alternate result is not a claim about the historical encounter. |

The appropriate historical outcome statement is that the supplied account describes an escape after maneuvering near concentrated hostile antiaircraft defenses. Do not turn that into a confirmed interceptor shoot-down, a deliberate friendly-fire kill, or a claim that ground defenses knowingly assisted the Intruder.

## Briefing and debrief wording suitable for the game

**Short briefing:**

> North Vietnam, 1966. This reconstruction draws on an account of a VA-65 A-6A from USS Constellation, crewed by LT R. S. Williams and B/N LT J. E. Diselrod, escaping an unidentified pursuer near Nam Dinh by maneuvering into hostile antiaircraft fire. The MiG-17PF portrayal, radio dialogue, terrain and combat sequence are dramatized; the interceptor's actual type is unconfirmed. Your task is to bring both crew members home, not to win a fighter duel.

**Short successful debrief:**

> WILLARD EGRESS — Contact broken. In the encounter that inspired this reconstruction, hostile antiaircraft fire apparently disrupted a pursuing aircraft and enabled an Intruder to escape. This mission's specific combat events and outcome were produced by your flight; they are not a confirmed record of the 1966 sortie.

These paragraphs are authored explanatory text, not quotations from the historical crew. Preserve an accessible in-game reconstruction label and keep this source audit with the source release.
