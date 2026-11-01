# Draft: data request to the City of Berkeley (not sent)

**To:** [City contact: Fire Department / Office of Emergency Services, or Public Works Transportation]
**Cc:** [optional: KLD Engineering project contact for the 2025 Evacuation Time Study]
**Subject:** Request for evacuation study data: curb parking, model network, and zone layers

---

Hello [name],

I'm a Berkeley Hills resident building an educational, browser-based tool that lets residents
explore wildfire evacuation tradeoffs on Berkeley's real street network: when zones are
ordered, leaving early, parking on narrow hill streets, and fire-engine access. It is clearly
labeled as a teaching tool, not a prediction or an official plan, and it points people to the
City's evacuation pages. Every number in it shows where it came from.

I've built it on the City's public GIS layers (street centerlines, Narrow_Roads, Genasys zones,
Evac_Regions, fire zones) and calibrated it against the 2025 Evacuation Time Study, the SB 99
Access Impaired Neighborhood report and the AB 747 route analysis. Its evacuation times for the
1923 Repeat and Panoramic Hill night and weekend cases come within about 15 minutes of the study.

A few datasets would replace guesses with the City's data. Would it be possible to share
any of the following?

1. **Curb parking data** used by KLD for the SB 99 and AB 747 analyses: where parking is allowed
   on one side, both sides or neither, and red curbs. Right now I estimate it from street photos
   and from parked cars counted on City aerial photos, which only show one daytime moment.
2. **The KLD model network and demand for the 2025 Evacuation Time Study**: link and node tables
   with lanes, speeds, capacities and intersection control, and the employee, student, visitor
   and transit-dependent demand by zone. Without the non-resident demand my weekday daytime
   times run about an hour faster than the study's.
3. **Leave Early Zone boundaries**, as GIS polygons.
4. **Traffic diverters, traffic circles, bollards and gates** in the hills, as points or lines.
   The study identifies the Channing/Piedmont circle and the Derby St diverter as key
   constraints for Panoramic Hill.
5. **How `Width_w_Parking` in the Narrow_Roads layer was produced.** It appears to be
   pavement width minus 7 ft per parked side. Was it measured in the field anywhere?
6. **Berkeley Fire's view of which hill streets engines have trouble reaching** with normal
   parking, if that can be shared in any form.

I'm not asking for anything with personal or household information, and I won't publish
addresses. I'm happy to share the tool and its source notes with staff, and to credit the City
and KLD for anything you provide.

One small thing I noticed: the City's links to the full SB 99, AB 747 and Evacuation Time Study
PDFs (from the Evacuation StoryMaps text version) currently return "page not found". I found
copies in the Internet Archive.

Thank you for any help, and for the work behind the evacuation study.

Best regards,
Eric Friedman
[phone / email]
