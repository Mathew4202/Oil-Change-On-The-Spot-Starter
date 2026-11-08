// HQ's Text buttons open the Quo app (not the phone's own Messages), so the text goes from the business number
// and shows up in Quo with the rest of the conversation. Quo's link format: support.quo.com deep-linking.
export const quoText = (phone: string) => `openphone://message?number=${encodeURIComponent(phone)}&selectedAsFallback=true`;
/** Call buttons: open Quo and start the call from the business number. */
export const quoCall = (phone: string) => `openphone://dial?number=${encodeURIComponent(phone)}&selectedAsFallback=true&action=call`;
