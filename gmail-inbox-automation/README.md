# Automatic Inbox Placement for Website Contact Messages

The public website currently submits contact messages through a third-party mail relay. Gmail can classify messages from any shared relay as Spam even when SPF, DKIM, and DMARC pass. Website HTML and JavaScript cannot override Gmail's recipient-side classification.

This optional Google Apps Script automatically moves matching website-contact messages from Spam to Inbox in **MojtahediRamtin@gmail.com**. It marks the thread important, leaves it unread, and applies the **Website Contacts** label.

## One-time setup

1. Sign in to **MojtahediRamtin@gmail.com**.
2. Open `https://script.google.com/create`.
3. Replace the default editor content with the complete contents of `Code.gs` in this folder.
4. Save the project as `Ramtin Website Contact Inbox`.
5. Select `installWebsiteContactInboxAutomation` and choose **Run**.
6. Review and approve the Gmail and trigger permissions for the script you created.
7. Confirm that the execution result says the automation was installed.

After that one setup, the script runs every five minutes. It does not require manually selecting **Not spam** for each future website message.

## Verification

Run `websiteContactInboxAutomationStatus` in the Apps Script editor. The returned JSON reports whether the recurring trigger exists and how many matching Spam threads remain.

## Disable

Run `uninstallWebsiteContactInboxAutomation`.

## Important limitation

This script fixes placement inside the Gmail account where it is installed. The stronger long-term solution is to replace the shared relay with an authenticated sender on an owned domain or a Google Apps Script contact endpoint deployed by the recipient account.
