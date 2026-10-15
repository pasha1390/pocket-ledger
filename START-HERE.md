# Start here: from zero to a running app

This guide assumes you have installed nothing and never used a terminal. Allow about 15 minutes.

## Part 1: Install two free programs

1. **Node.js** (this runs the app). Go to https://nodejs.org and click the button marked **LTS**. Open the file you downloaded and click Next, Next, Install (the default choices are fine). When it finishes, **restart your computer**.
2. **Visual Studio Code** (the editor). Go to https://code.visualstudio.com, click Download, and install it with the default choices.

## Part 2: Get the project

3. Download `pocket-ledger.zip` from the chat.
4. **Unzip it.**
   - Windows: right-click the zip, choose **Extract All**, then Extract.
   - Mac: double-click the zip.
   Move the unzipped `pocket-ledger` folder somewhere easy, for example Documents.
5. Open **Visual Studio Code**. Choose **File, then Open Folder**, and pick the `pocket-ledger` folder. Open the folder that contains `package.json` (not a folder one level above it). If VS Code asks "Do you trust the authors?", click **Yes, I trust the authors**.

## Part 3: Install and set up

6. Open the terminal inside VS Code: menu **Terminal, then New Terminal**. A panel appears at the bottom. Its first line should end with `pocket-ledger`.
7. Check Node is installed. Type this and press Enter:
   ```
   node -v
   ```
   You should see a number like `v22.11.0`. If you see "not recognized" or "command not found", restart your computer and open VS Code again.
8. Install the app's packages (takes 1 to 2 minutes). Type:
   ```
   npm install
   ```
   Yellow `WARN` lines are normal. Only red `ERR!` lines are a problem. If you see one, copy it and send it to me.
9. Create your settings file. Type the line for your computer:
   - Windows: `copy .env.example .env`
   - Mac or Linux: `cp .env.example .env`
   A new file called `.env` appears in the file list on the left.
10. Make a secret key. Type:
    ```
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
    ```
    It prints a long string of letters and numbers. Select it and copy it.
11. Click `.env` in the file list. Find the line `JWT_SECRET=change-me`. Replace `change-me` with the string you copied, so it reads `JWT_SECRET=` followed by your string, with no spaces. Press **Ctrl+S** (Mac: Cmd+S) to save.

## Part 4: Run it

12. In the terminal, type:
    ```
    npm start
    ```
    After a moment you will see `Pocket Ledger running at http://localhost:3000`. **Leave this terminal open.** The app only runs while it is open.
13. Open Chrome and go to **http://localhost:3000**. You will see Pocket Ledger.

## Part 5: Try everything

14. You start as a **guest**: your data is saved in this browser only. Open the menu (the three lines, top left), then **Settings**, then **Add sample data** to fill the app with examples.
15. **Create an account.** Menu, then **Sign in or create account**, then the **Create account** tab. Enter your first name, last name, email and a password of 8 or more characters, then press Create account.
16. **Find your verification code.** Because email is not set up yet, nothing is sent. Look in the **VS Code terminal**: you will see a block that starts with `[email to ...]` and contains `Your code: 123456`. Type that code into the website. (The same email is also saved in the `data/outbox` folder.) You are now signed in, and your name appears on the bank card.
17. **Signing in later** works the same way: password, then a new code that appears in the terminal.
18. **Export:** Menu, then **Import & Export**, press **Export…**, and choose **Download** or **Email it to me**. Without email set up, the emailed file is saved in `data/outbox` instead.
19. **Delete all data:** Menu, then **Settings**, then **Delete all data…**, then **Yes, delete everything**.

## Part 6: Stop and start again

- **Stop:** click inside the VS Code terminal and press **Ctrl+C**.
- **Start again later:** open VS Code (it remembers the folder), open a new terminal, and type `npm start`. Then open http://localhost:3000.
- While you are editing the code, use `npm run dev` instead. It restarts by itself when you save.

## Part 7 (optional): Send real emails

To make codes and exports arrive in a real inbox you need an SMTP account. Gmail is an easy example:

1. In your Google account, turn on **2-Step Verification**, then create an **App password** (search "app passwords" in your Google account settings).
2. Edit `.env` so these lines read (use your own address and the 16-letter app password with no spaces):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=your-16-letter-app-password
   MAIL_FROM="Pocket Ledger <youraddress@gmail.com>"
   ```
3. Save, stop the app (Ctrl+C) and run `npm start` again.

Other providers (Brevo, Mailgun, SendGrid, Amazon SES) work the same way: copy the host, port, username and password they give you.

## Part 8 (optional): The Google sign-in button

1. Go to https://console.cloud.google.com, open **APIs & Services, then Credentials**.
2. **Create credentials, then OAuth client ID**, type **Web application**.
3. Under **Authorized JavaScript origins** add `http://localhost:3000`.
4. Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID=your-client-id`, save, and restart the app.

## If you already have an older copy

Unzip the new version into a new folder. To keep your accounts and data, copy the old folder's `.env` file and `data` folder into the new folder before you run `npm start`. Then run `npm install` once in the new folder.

## Problems

| What you see | What to do |
| --- | --- |
| `node` is not recognized | Restart your computer, then reopen VS Code. |
| `npm install` shows red `ERR!` | Copy the lines and send them to me. Make sure the terminal is inside the `pocket-ledger` folder. |
| "Cannot find module" when starting | You skipped `npm install`. Run it. |
| The page does not load | Check the terminal still shows "running", and the address is exactly `http://localhost:3000`. |
| "Port 3000 is already in use" | Another copy is running. Close that terminal, or set `PORT=3001` in `.env` and use that address. |
| You never see a code | Look at the **VS Code terminal** (not the website), or in the `data/outbox` folder. |
| Signed out every time you restart | `JWT_SECRET` in `.env` is still `change-me` or empty. |
