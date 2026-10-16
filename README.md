# CxTools Lite

## What it does

CxTools Lite adds an orange button to Procore's Inspections pages. Click it to get a printable list of the Equipment Information answers from one inspection or from every inspection in your current list.

## Install

1. Install the **Tampermonkey** extension for your browser (Chrome or Edge) from the browser's extension store.
2. Open your browser's extensions page (`chrome://extensions` or `edge://extensions`), find Tampermonkey, click **Details**, and turn on **Allow User Scripts**.
3. Open this link and click **Install**:
   https://raw.githubusercontent.com/justinboggs0/cxtools-lite/main/cxtools-lite.user.js

## Use

1. In Procore, open an inspection, or open the Inspections list and set the filters you want.
2. Click the orange **CxTools Lite** button at the bottom right.
3. On the list, untick any inspections you don't need. The filter box narrows the list, and **Select all** / **Select none** change only the rows you can see.
4. Click **Equipment list**. The list opens in a new tab while the Procore tab shows the progress. Click **Cancel** to stop early.
5. In the new tab you can switch between one table per template and one block per inspection, and use **Print**, **Copy for OneNote** or **Download CSV**.

The button can be dragged anywhere on the page. Press and hold it to shrink it to a small tab; press and hold again to bring it back. If it ever ends up somewhere you can't reach, open the Tampermonkey menu and click **Reset button position**.

## If it says you were logged out

Procore logs you out after a while. Log in to Procore again, then click the button again.

## Updates

Tampermonkey checks for a new version about once a day and installs it for you. To get it right away, open the Tampermonkey menu and click **Check for updates**.

## Releasing a new version

The script people install is `cxtools-lite.user.js`. It is built from the files in `src/`, so don't edit it by hand.

1. Make the change in `src/`.
2. Raise `version` in `package.json` (for example `1.0.0` to `1.0.1`). Without a higher version, Tampermonkey won't pick up the change.
3. Run `npm run check`. It rebuilds `cxtools-lite.user.js` and runs the tests.
4. Commit and push to `main`.

## License

You may install CxTools Lite and use it for your own work. Anything more, such as installing it for other people, putting it into company systems, or copying, changing or sharing the code, needs written permission first. The full terms are in `LICENSE`.
