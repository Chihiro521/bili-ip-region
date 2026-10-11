import { MOBILE_UA } from './probe.ts';
let headerTask: Promise<void> | null = null;
export function configureHeaders(): Promise<void> {
  if (headerTask) return headerTask;
  headerTask = chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1, priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [{ header: 'user-agent', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: MOBILE_UA },
          { header: 'origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE }],
      },
      condition: {
        regexFilter: '^https://(app\\.bilibili\\.com|grpc\\.biliapi\\.net)/bilibili\\.app\\.dynamic\\.v2\\.(Dynamic/DynDetail|Opus/OpusDetail)$',
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
      },
    }],
  }).catch(error => { headerTask = null; throw error; });
  return headerTask;
}
