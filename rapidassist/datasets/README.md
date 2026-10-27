# RapidAssist service recommendation dataset

File: `rapidassist_service_recommendation_1200.csv`

UTF-8 CSV with exactly two columns, `text,label`, and 1,200 examples plus the header. Rows are shuffled with a fixed seed. All texts are unique, including after lowercasing and removing punctuation.

| Label | Roman Urdu / mixed language | English | Total |
| --- | ---: | ---: | ---: |
| mechanic | 200 | 200 | 400 |
| fuel_delivery | 200 | 200 | 400 |
| towing | 200 | 200 | 400 |
| Total | 600 | 600 | 1,200 |

## Origin and labeling

These are AI-authored synthetic examples, not collected customer messages. They include conversational requests, short messages, spelling variations, negation, and related problem descriptions.

- `mechanic`: requests for inspection or repair, battery help, starting faults, puncture repairs, spare-wheel fitting, and electrical problems. A non-starting vehicle with fuel available can belong here.
- `fuel_delivery`: explicitly empty or insufficient petrol/diesel, or a request to have fuel brought to the vehicle. A suspected fuel-system fault with fuel still in the tank belongs under repair instead.
- `towing`: vehicle recovery or transport, accident damage preventing driving, stuck vehicles, or a request to take a disabled vehicle to a workshop. A failed roadside repair followed by an explicit tow request belongs here.

The dataset uses the requested label `towing`. The active RapidAssist request API uses `car_towing`; map that label before creating an API request. Provider service categories also include `towing`, so the mapping depends on which API field is being populated.

## Training and evaluation

English/Roman Urdu translations and related paraphrases are present. Keep equivalent descriptions in the same train/validation/test group; a random row split can overstate accuracy. Fit the text vectorizer on training data only, and evaluate on independently written descriptions as well.

This is a starting dataset, not evidence of production accuracy. It covers only three services and does not include an `unknown` class. Ambiguous or unsupported inputs should allow clarification or manual service selection.
