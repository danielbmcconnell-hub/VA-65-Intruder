# Milestone 2.1 historical source audit

This document separates material actually retrieved from supplied references, unresolved historical claims, and fictional gameplay. It supplements the preserved Milestone 2 audit; it does not replace that document or convert the Gemini-generated Coker summary into a verified transcript.

## Retrieval and verification scope

Three substantive institutional sources from the Smithsonian National Museum of American History were retrieved and read during this stage. Several institutional homepages, catalog searches and U.S. Naval Institute oral-history index pages were also accessible; those indexes do not constitute reading the oral histories themselves. Requests to the Naval History and Heritage Command returned HTTP 503. Other requested sources were blocked, unavailable, or returned invalid-page responses. The exact 46 requests, HTTP errors, successful public-page responses, retrieval timestamps, byte counts, and SHA-256 hashes are archived in [milestone2_1-retrieval.json](historical_sources/milestone2_1-retrieval.json).

Successful retrieval means that the listed public HTML page was read. It does not establish permission to reproduce photographs, film, or an entire archival transcript. Unsuccessful candidate URLs have not been validated as current locations and must not be described as sources consulted.

## Institutional sources actually read

### S1 — Smithsonian: Sam Johnson's POW possessions

[Congressman Sam Johnson Donates POW Possessions to Smithsonian](https://americanhistory.si.edu/press/releases/congressman-sam-johnson-donates-pow-possessions-smithsonian), published 13 February 2018.

The museum describes the Alcatraz group as prisoners separated from others because of their resistance. It describes windowless concrete individual cells, leg cuffs, lighting on twenty-four hours a day, and Sam Johnson's prolonged solitary confinement. It also explains how his cup became a means of communication and survival. These support physically separated prisoners, covert communication, restricted movement, constant light, ordinary objects used for communication, and mutual support in the game.

**Dimension discrepancy:** this article describes **four-by-nine-foot** cells. The earlier user requirement and existing Milestone 2 cell use approximately **three-by-nine feet**. The existing cell is therefore a game approximation and must not be captioned as an exact measurement corroborated by this museum page. The source does not supply a surveyed floor plan or the cell positions of all eleven men.

The article records Johnson's release on 12 February 1973 and subsequent journey home. It does not justify assigning that exact individual release date to every prisoner. Operation Homecoming framing in the game should remain broad unless a person's release record is separately checked.

### S2 — Smithsonian: American POWs in Vietnam

[American POWs in Vietnam](https://americanhistory.si.edu/explore/exhibitions/price-of-freedom/online/vietnam/american-pows-vietnam), The Price of Freedom exhibition.

The exhibit identifies prison nicknames including Alcatraz, Dirty Bird and the Hanoi Hilton. It describes isolation, deprivation, mistreatment, staged propaganda, exercise where possible, mental lists, and imagining houses in great detail. It describes covert messages, gestures and wall tapping using pairs of numbers for letters. The communication network supported a command structure, a roster of prisoners, information, and emotional connection.

This supports the game's broad themes of mental construction, communication and solidarity. The particular engine-part puzzle, house materials budget, imaginary city grid, memory tasks, numerical condition effects and objective thresholds are original game designs. The exhibit does not establish that Denton invented the tap code or that any named prisoner used the exact game puzzles.

The exhibit contains an attributed recollection under the name “James Stockton.” This audit does not silently change that name to Stockdale or borrow the passage as an authenticated Stockdale quotation.

### S3 — Smithsonian: POWs in the public eye

[POWs in the Public Eye](https://americanhistory.si.edu/explore/exhibitions/price-of-freedom/online/vietnam/american-pows-vietnam/pows-public-eye), The Price of Freedom exhibition.

This page describes propaganda presentation of prisoners, the work of families and the media, and approximately six hundred POWs returning at the war's end. It supports context for the historical interview's importance. It does not contain the Denton interview, its date, an intelligence-service assessment, or the Morse-code sequence.

## Supplied materials and their limits

- The Denton and Stockdale photographs are user-identified supplied color PNGs. Original bytes and original dimensions are preserved in the reference materials. Their archival creator, exact image date, rights, and any colorization process were not established by the upload. Captions must say “user-supplied color photograph” and preserve the distinction between the user's identification and independent archival authentication. No AI replacement or invented archival footage is warranted.
- The six earlier enhanced historical photographs and their masters retain their existing provenance notes and colorization labels. The family tribute photographs of William S. McConnell remain separate.
- `Coker Interview Summary.docx` was generated by Gemini, as confirmed by the user. The user supplied [interview part 1](https://www.youtube.com/watch?v=k6d_teRSYOU) and [part 2](https://www.youtube.com/watch?v=TlUR9dRWlIk). Neither video nor captions could be retrieved here. The summary is secondary inspiration, not a verbatim or independently checked interview.
- The user's Milestone 2.1 addendum is an authorized development request. Historical assertions in it still require checking. Its request to portray Denton, Stockdale and the separated Alcatraz prisoners does not authorize invented quotations attributed to those people.

## Chronology and unresolved factual details

| Detail | Status and implementation rule |
| --- | --- |
| Denton flew an A-6A Intruder and was shot down in July 1965 | Supplied historical context; commonly documented date is 18 July 1965, but an authoritative biography was not retrieved in this stage. Use conservative biographical copy and identify its verification status. |
| Denton was VA-75 commanding officer at the time of shootdown | The user's addendum makes this claim. His exact 1965 position was not verified here and may conflate squadron and air-wing assignments. Omit the command-position assertion until a service biography or contemporary record resolves it. Do not present a competing unverified role as a confirmed correction. |
| Stockdale's shootdown and senior POW leadership | Supplied historical context; commonly documented date is 9 September 1965. His exact capture-era rank, aircraft and command assignment should be checked before adding detailed captions. Smithsonian verifies POW command structures generally, not Stockdale's individual biography. |
| Denton's Morse-code interview | The user specifies 2 May 1966 and the message `TORTURE`. Preserve it as a separate historical flashback before the 1967 escape. No interview footage, transcript, licensing record or exact intelligence chronology was read here. |
| Coker–McKnight escape | Existing historical baseline: 12 October 1967; Coker was Navy and George G. McKnight a U.S. Air Force captain for this escape episode. The approximate fifteen-mile journey and recapture remain separate from fictional game endings. Primary-source corroboration remains pending. |
| Alcatraz chapter opening | Use **late October 1967**, after the escape and recapture. The Gemini summary says 27 October; a competing commonly reported chronology gives 25 October. Neither exact day was independently verified here. Do not silently resolve that discrepancy. |
| Individual cell order and communication topology | No exact surveyed layout was retrieved. The game uses separated schematic cells and reconstructed routes for covert messages. These are not assertions that a named prisoner occupied the next cell. |
| Repeated escape opportunities and return to regular imprisonment | Fictional playable progression. Health/morale objectives, timing, transfers and guard clues do not reconstruct a specific historical prisoner's individual chronology. |
| Release | Operation Homecoming in 1973 is the era's documented release context. Individual release dates and all other alternate endings remain clearly distinguished. |

## Alcatraz Eleven roster: verification pending

The following is the conventional roster used as a reference checklist. It was not independently confirmed by a substantive authoritative roster retrieved during this stage. Names should be reviewed against service records or firsthand accounts before representing an exact historical roll call as source-verified. Career and capture-era ranks must not be conflated.

| Person | Service | Representation limit |
| --- | --- | --- |
| George Thomas Coker | U.S. Navy | Preserve the existing October 1967 escape context. |
| Jeremiah Andrew Denton Jr. | U.S. Navy | Communication and leadership context; no claim that he invented the tap code. |
| Harry Jenkins | U.S. Navy | Identity in a separated, reconstructed communication network. |
| Samuel Robert Johnson | U.S. Air Force | Smithsonian directly confirms Alcatraz confinement, communication and solitary conditions. |
| George G. McKnight | U.S. Air Force | **Included among the Eleven**; do not omit him or recast him as Navy. |
| James Mulligan | U.S. Navy | Identity in a separated, reconstructed communication network. |
| Howard Rutledge | U.S. Navy | Identity in a separated, reconstructed communication network. |
| Robert Shumaker | U.S. Navy | The supplied secondary summary describes communication themes; exact dialogue is reconstructed. |
| James Bond Stockdale | U.S. Navy | Leadership and mental-discipline themes; no invented authentic quotations. |
| Ronald Storz | U.S. Air Force | Do not imply that every member survived to the 1973 release; individual outcomes need verification. |
| Nels Tanner | U.S. Navy | Identity in a separated, reconstructed communication network. |

Discovering a name through the game does not establish an exact neighboring-cell relationship or the date that a real prisoner learned that name. Historical prisoners are not free-roaming social NPCs in Alcatraz.

## BACK US and mental discipline

The user requests Stockdale's historical **BACK US** guidance. Its commonly reported expansion is listed below as a **provisional plain-language paraphrase**, not as exact Stockdale quotations. No first-person wording was successfully retrieved in this stage:

| Letter | Commonly reported meaning; primary wording pending |
| --- | --- |
| B | Do not bow in public. |
| A | Stay off the air; avoid propaganda broadcasts. |
| C | Admit no crimes. |
| K | Do not kiss them goodbye. |
| US | Unity over Self, one combined solidarity principle. |

Do not invent a separate “S = silence” expansion. Here the two final letters refer to Unity over Self together; exact first-person phrasing still requires checking.

These were resistance guidance under coercive captivity, not a moral scoring system. Game decisions must not imply that forced compliance, physical suffering, needing rest, or inability to maintain silence demonstrates deficient courage. Choosing recovery, seeking support and preserving dignity remains meaningful. Reconstructed messages and dilemmas should be labeled as such, rather than rendered as authentic words spoken by Stockdale or Denton.

Stockdale's connection to Stoicism and Epictetus is supplied historical context awaiting an accessible first-person source here. An exercise about distinguishing choices from conditions outside one's control is a game interpretation. It must not imply that philosophy prevented real pain, eliminated trauma, or made suffering a failure of thought.

Optional prayer, familiar songs, family memories, the Boy Scout Oath and Law, personal principles, imaginary construction and gentle physical activity are coping options. Numerical benefits and progressive game challenges are abstractions. None should be presented as a clinical model or a required belief system for surviving captivity.

## Denton flashback presentation

Use the user's still photograph with its provenance label. Identify the activity as a **historical flashback to May 1966**, separate from the player's 1967 chapter. A timed graphic that teaches decoding `T-O-R-T-U-R-E` is an educational reconstruction of Morse symbols, **not authentic film, verified blink timings, or a literal reanimation of Denton's movements**.

Explain conservatively that the covert message communicated evidence of mistreatment beyond the captors' intended propaganda presentation. Exact broadcast reach, interception procedures, intelligence personnel and timelines require archival verification before inclusion. The ordinary wall-tap code and this Morse-code flashback are separate systems and must not be conflated.

## Further authoritative review

Pending follow-up should consult:

1. Naval History and Heritage Command service biographies, aircraft and unit records, POW records, and citations for Denton, Stockdale and Coker. Current requests returned 503; candidate page paths were not validated.
2. National Archives interview/broadcast holdings and Department of Defense POW records. Requests here were proxy-blocked before those websites responded.
3. Denton's firsthand *When Hell Was in Session* and Stockdale's firsthand writings, including *Thoughts of a Philosophical Fighter Pilot* and *Courage Under Fire*, for exact historical language. Mentioning these titles is a review recommendation, not a claim their full texts were read.
4. Sam Johnson's *Captive Warriors* and firsthand Alcatraz accounts for the roster, day-specific chronology and physical arrangement. The Smithsonian article quotes Johnson's book, but the full book was not read here.
5. Coker's actual two-part interview and service citation to reconcile the secondary summary's damaged passages and dates.

No fictional escape success, prison transfer, player condition score, guard routine, puzzle, reconstructed prisoner message or dialogue should be used as historical evidence. Documented recapture and the hypothetical route to freedom remain separate.
