/**
 * Ramtin Mojtahedi website-contact inbox automation
 *
 * Install this Apps Script while signed in to MojtahediRamtin@gmail.com.
 * After one authorization, it checks Gmail every five minutes and moves website
 * contact messages from Spam to Inbox, marks them important, leaves them unread,
 * and applies the "Website Contacts" label.
 *
 * This automation is specific to the current relay sender. If the website later
 * moves to an owned-domain or Google Apps Script mail backend, update SENDER.
 */

const WEBSITE_CONTACT_INBOX_RULE = Object.freeze({
  SENDER: 'noreply@email.gosecureserver.in',
  LABEL: 'Website Contacts',
  LOOKBACK_DAYS: 30,
  MAX_THREADS_PER_RUN: 100,
  TRIGGER_MINUTES: 5
});

/**
 * Run this once from the Apps Script editor while signed in to
 * MojtahediRamtin@gmail.com. It authorizes Gmail access, removes duplicate
 * triggers, installs the recurring trigger, and processes existing matches.
 */
function installWebsiteContactInboxAutomation() {
  removeWebsiteContactInboxAutomationTriggers_();

  ScriptApp.newTrigger('moveWebsiteContactMessagesToInbox')
    .timeBased()
    .everyMinutes(WEBSITE_CONTACT_INBOX_RULE.TRIGGER_MINUTES)
    .create();

  const result = moveWebsiteContactMessagesToInbox();
  return 'Installed successfully. ' + result;
}

/**
 * Moves matching website-contact threads from Spam to Inbox.
 * This function is called automatically by the installed time trigger.
 */
function moveWebsiteContactMessagesToInbox() {
  const query = [
    'in:spam',
    'from:' + WEBSITE_CONTACT_INBOX_RULE.SENDER,
    'newer_than:' + WEBSITE_CONTACT_INBOX_RULE.LOOKBACK_DAYS + 'd'
  ].join(' ');

  const threads = GmailApp.search(
    query,
    0,
    WEBSITE_CONTACT_INBOX_RULE.MAX_THREADS_PER_RUN
  );

  if (!threads.length) {
    return 'No matching Spam threads were found.';
  }

  const label = getOrCreateWebsiteContactLabel_();

  threads.forEach(function(thread) {
    thread.moveToInbox();
    thread.markImportant();
    thread.markUnread();
    thread.addLabel(label);
  });

  return threads.length + ' website-contact thread(s) moved to Inbox.';
}

/**
 * Removes the recurring automation. Run only when you want to disable it.
 */
function uninstallWebsiteContactInboxAutomation() {
  removeWebsiteContactInboxAutomationTriggers_();
  return 'Website-contact inbox automation removed.';
}

/**
 * Returns the current installation and matching-message status without changing
 * the trigger configuration.
 */
function websiteContactInboxAutomationStatus() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'moveWebsiteContactMessagesToInbox';
  });

  const query = [
    'in:spam',
    'from:' + WEBSITE_CONTACT_INBOX_RULE.SENDER,
    'newer_than:' + WEBSITE_CONTACT_INBOX_RULE.LOOKBACK_DAYS + 'd'
  ].join(' ');

  return JSON.stringify({
    installed: triggers.length > 0,
    triggerCount: triggers.length,
    matchingSpamThreads: GmailApp.search(query, 0, 100).length,
    sender: WEBSITE_CONTACT_INBOX_RULE.SENDER,
    label: WEBSITE_CONTACT_INBOX_RULE.LABEL
  });
}

function getOrCreateWebsiteContactLabel_() {
  return GmailApp.getUserLabelByName(WEBSITE_CONTACT_INBOX_RULE.LABEL) ||
    GmailApp.createLabel(WEBSITE_CONTACT_INBOX_RULE.LABEL);
}

function removeWebsiteContactInboxAutomationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'moveWebsiteContactMessagesToInbox') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
