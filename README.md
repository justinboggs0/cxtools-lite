# CxTools Lite

## What it does

CxTools Lite adds an orange button to Procore's Inspections pages. Click it to get a printable list of the Equipment Information answers from one inspection or from every inspection in your current list.

## Install

This takes about 5 minutes and you only do it once. It works in **Google Chrome** and **Microsoft Edge** (and other browsers built on Chrome, like Brave). Do it on the computer where you use Procore.

### Step 1: Add Tampermonkey to your browser

Tampermonkey is a free browser add-on that runs small scripts like this one.

1. Open the link for your browser:
   - **Chrome:** https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo
   - **Edge:** https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd
2. Click the blue button: **Add to Chrome** (Chrome) or **Get** (Edge).
3. A box pops up asking if you want to add it. Click **Add extension**.
4. A Tampermonkey page may open in a new tab. You can close it.

### Step 2: Pin Tampermonkey so you can see it

1. At the top right of the browser, next to the address bar, click the **puzzle piece** icon (Extensions).
2. Find **Tampermonkey** in the list and click the **pin** next to it.
3. A small black square with two white dots now shows at the top right. That is Tampermonkey.

### Step 3: Let Tampermonkey run scripts

Your browser asks you to turn this on yourself, one time.

1. **Right-click** the Tampermonkey icon (the black square) and click **Manage extension**.
2. On the page that opens, scroll down and turn on **Allow User Scripts** (the switch turns blue).
3. **Only if you don't see "Allow User Scripts":**
   - Type `chrome://extensions` (Chrome) or `edge://extensions` (Edge) in the address bar and press **Enter**.
   - Turn on **Developer mode**. In Chrome it is at the top right; in Edge it is in the menu on the left.
4. Close that tab.

### Step 4: Install CxTools Lite

1. Open this link:
   https://raw.githubusercontent.com/justinboggs0/cxtools-lite/main/cxtools-lite.user.js
2. A Tampermonkey page opens showing **CxTools Lite**. Click **Install**.
3. That's it. Go to Procore and open any inspection or the Inspections list. You'll see an orange **CxTools Lite** button near the bottom right.

### If something goes wrong

- **No orange button in Procore:** refresh the Procore page (press **F5**). If it still isn't there, go back to Step 3 and check that **Allow User Scripts** is on.
- **The link in Step 4 shows a page full of code instead of an Install button:** Tampermonkey isn't installed or isn't on yet. Do Steps 1 to 3 again, then open the link again.
- **The store says your organization blocks this extension:** your work computer doesn't allow add-ons, so this can't be installed on it.

## Use

1. In Procore, open an inspection, or open the Inspections list and set the filters you want.
2. Click the orange **CxTools Lite** button at the bottom right.
3. On the list, untick any inspections you don't need. The filter box narrows the list, and **Select all** / **Select none** change only the rows you can see.
4. Click **Equipment list**. The list opens in a new tab while the Procore tab shows the progress. Click **Cancel** to stop early.
5. In the new tab you can switch between one table per template and one block per inspection, and use **Print**, **Copy for OneNote** or **Download CSV**.

The button can be dragged anywhere on the page. Press and hold it to shrink it to a small tab; press and hold again to bring it back. If it ever ends up somewhere you can't reach, click the Tampermonkey icon (the black square at the top right of the browser), then click **Reset button position** under CxTools Lite.

## If it says you were logged out

Procore logs you out after a while. Log in to Procore again, then click the button again.

## Updates

Tampermonkey checks for a new version about once a day and installs it for you. To get it right away, click the Tampermonkey icon (the black square at the top right of the browser) and click **Check for userscript updates**.

## Releasing a new version

The script people install is `cxtools-lite.user.js`. It is built from the files in `src/`, so don't edit it by hand.

1. Make the change in `src/`.
2. Raise `version` in `package.json` (for example `1.0.0` to `1.0.1`). Without a higher version, Tampermonkey won't pick up the change.
3. Run `npm run check`. It rebuilds `cxtools-lite.user.js` and runs the tests.
4. Commit and push to `main`.

## License

You may install CxTools Lite and use it for your own work. Anything more, such as installing it for other people, putting it into company systems, or copying, changing or sharing the code, needs written permission first. The full terms are in `LICENSE`.
