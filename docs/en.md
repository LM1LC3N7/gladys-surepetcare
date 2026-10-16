# Sure Petcare

This integration brings the connected **Sure Petcare** devices into Gladys:
**SureFlap** cat flaps and pet doors, **SureFeed** feeders and **Felaqua**
water stations, linked to the Sure Petcare cloud by their hub. It uses the
account of the Sure Petcare app. Unofficial, not affiliated with Sure Petcare.

> **Development version (0.1).** Built from the community clients of the Sure
> Petcare API (surepy, used by Home Assistant, ioBroker.sureflap) and tested
> with simulated answers, not with a real account yet. Feedback is welcome on
> the GitHub repository.

## What you get

One Gladys device per Sure Petcare device, and one per pet:

| Device                    | In Gladys                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- |
| Hub                       | online (yes/no)                                                                   |
| Cat flap, pet door        | lock mode (settable), battery %, online                                           |
| SureFeed feeder (Connect) | weight of each bowl (g), last meal (g) and the pet that ate it, battery %, online |
| Felaqua                   | water left (mL), water level %, battery %, online                                 |
| Each pet                  | inside or not, for how many minutes, last meal (g), last drink (mL)               |

- "Inside" is recorded at the time the pet went through the flap (or was set
  in the app), not at the time of the reading: the history shows the real
  times in and out. "Time since the last move" counts the minutes since then,
  handy for a scene like "the cat has been out for more than 6 hours".
- The last meal and the last drink are dated with the time of the meal. The
  grams are generic sensors (Gladys has no mass unit), hence the "(g)" in
  their names.
- The battery comes from the Sure Petcare app when it gives one, otherwise
  from the voltage of the four AA cells (1.25 V empty, 1.6 V full, like Home
  Assistant).
- The badge of each device shows `cloud`; `unreachable` with an orange dot
  when the hub reports the device offline, plain `unreachable` when Sure
  Petcare does not answer.

## Installation

1. Install the integration from the Gladys store.
2. In the **Configuration** tab, enter the e-mail and password of your Sure
   Petcare account (the ones of the app), then save.
3. The status says "Connected to Sure Petcare: 5 devices, 2 pets" and the end
   date of the session the integration opened.
4. Open the **Discovery** tab and add the devices and pets you want to follow.
   Their values arrive as soon as they are added.

The **Test the connection** button reads the account and summarizes what it
holds and where each pet is.

## Lock mode and curfew

The mode of each flap can be set from Gladys (dashboard, scenes):

| Mode          | Effect                             |
| ------------- | ---------------------------------- |
| Unlocked      | pets go in and out freely          |
| Keep pets in  | pets can come in but not go out    |
| Keep pets out | pets can go out but not come in    |
| Locked        | neither in nor out                 |
| Curfew        | the curfew times of the flap apply |

The curfew uses the times set in the Sure Petcare app: set them there once.
Choosing another mode turns the curfew off, and going back to curfew turns
the same times back on. The hub takes a few seconds to apply a mode: Gladys
shows the mode asked for, and the next reading confirms it.

## Scenes

Three scene triggers, for one pet or for all:

- **Pet went out** and **Pet came in**: variables `pet_name`, `flap_name`
  (the flap used, empty when the change was made by hand in the app),
  `by_hand` and `since` (the time, UTC). The filter can target a pet and a
  flap.
- **Pet ate**: a feeder saw the pet eat at least 1 g; variables `pet_name`,
  `feeder_name`, `amount` (grams) and `at`. The filter can target a pet and
  a feeder.

A reading only sees the last move of each pet: a cat that went out and came
back between two readings gives one "Pet came in". Changes older than 15
minutes found at start-up or after an outage fire nothing: they are only
recorded.

The other values work with the usual "Device state changed" trigger (bowl
almost empty, water below 20 %, low battery, hub offline…).

## How often it reads

Everything is read in a single request (`me/start`), every 60 seconds by
default (30 to 600). Home Assistant reads every 3 minutes, the Sure Petcare
app more often. On errors the integration waits 1, 2, 5, 10 then 15 minutes;
when Sure Petcare asks to slow down, it waits as long as asked (15 minutes
otherwise).

## Options

| Option                        | Default | Purpose                                                    |
| ----------------------------- | ------- | ---------------------------------------------------------- |
| E-mail, password              | —       | the account of the Sure Petcare app                        |
| Refresh interval (s)          | 60      | how often the account is read                              |
| Language of the feature names | French  | names of the features and modes of the devices added later |

## Troubleshooting

- **"Sure Petcare refused the e-mail or password"**: check them in the app,
  then in the configuration. The integration does not retry by itself
  (repeated refusals may lock an account): it waits for a change or a click on
  **Test the connection**.
- **"Sure Petcare cannot be reached"**: the Sure Petcare cloud or your
  Internet access is down (service status: https://status.surepetcare.io).
- **A device is `unreachable` with an orange dot**: the hub no longer sees it
  (batteries, range). Check it in the app.
- **The bowl weights stay empty**: your feeder may not give its weights in the
  answer read yet (older firmware). Open an issue on the GitHub repository.
- **Repeaters and programmers** are not supported yet.

## Privacy

The e-mail and password are stored by Gladys as a secret (never sent back to
the browser). The integration only sends them to
`app-api.production.surehub.io`, the cloud of the Sure Petcare app, to open a
session; it keeps the session token and a client id in its `/data` folder.
Sure Petcare, SureFlap, SureFeed and Felaqua are trademarks of their owner;
this integration is not affiliated with Sure Petcare.
