import "server-only";

import { AddressEditable, CountryExtended, MailType, PostcardSize, PscUseType, PostcardEditable } from "@lob/lob-typescript-sdk";
import { getLobPostcardsClient } from "./lob";

export type SenderSnapshot = {
  name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string | null;
};

export type RecipientSnapshot = {
  opportunityId: string;
  name: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export function postcardFrontHtml(sender: SenderSnapshot) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:48px;color:#173c45;background:#eef7f7"><div style="font-size:18px;font-weight:700;text-transform:uppercase">${escapeHtml(sender.name)}</div><h1 style="font-size:42px;line-height:1.05;margin-top:150px">Comfort, without the wait.</h1><p style="font-size:20px;line-height:1.4">A local HVAC team for repairs, tune-ups, and replacement conversations.</p><p style="font-size:20px;font-weight:700">Call ${escapeHtml(sender.phone)}</p></body></html>`;
}

export function postcardBackHtml(sender: SenderSnapshot, recipient: RecipientSnapshot) {
  const website = sender.website ? `<p>${escapeHtml(sender.website)}</p>` : "";
  const address2 = recipient.address2 ? `<br>${escapeHtml(recipient.address2)}` : "";
  const senderAddress2 = sender.address2 ? `, ${escapeHtml(sender.address2)}` : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:36px;color:#243436"><div style="font-size:18px;font-weight:700">${escapeHtml(recipient.name)}<br>${escapeHtml(recipient.address1)}${address2}<br>${escapeHtml(recipient.city)}, ${escapeHtml(recipient.state)} ${escapeHtml(recipient.zip)}</div><hr style="margin:60px 0 28px;border:0;border-top:1px solid #ccd9d9"><h2 style="font-size:24px">Your home deserves dependable comfort.</h2><p style="font-size:16px;line-height:1.45">If your heating or cooling system needs attention, we’re here to help with straightforward service from a local team.</p><p style="font-size:18px;font-weight:700">Call ${escapeHtml(sender.phone)}</p>${website}<hr style="margin:32px 0 18px;border:0;border-top:1px solid #ccd9d9"><p style="font-size:12px;color:#667777;text-transform:uppercase">Return address</p><p style="font-size:14px">${escapeHtml(sender.name)}<br>${escapeHtml(sender.address1)}${senderAddress2}<br>${escapeHtml(sender.city)}, ${escapeHtml(sender.state)} ${escapeHtml(sender.zip)}</p></body></html>`;
}

export async function createTestPostcard(sender: SenderSnapshot, recipient: RecipientSnapshot, idempotencyKey: string) {
  const postcard: PostcardEditable = new PostcardEditable({
    to: new AddressEditable({
      name: recipient.name,
      address_line1: recipient.address1,
      address_line2: recipient.address2,
      address_city: recipient.city,
      address_state: recipient.state,
      address_zip: recipient.zip,
      address_country: CountryExtended.Us,
    }),
    from: new AddressEditable({
      name: sender.name,
      address_line1: sender.address1,
      address_line2: sender.address2,
      address_city: sender.city,
      address_state: sender.state,
      address_zip: sender.zip,
      address_country: CountryExtended.Us,
      phone: sender.phone,
    }),
    size: PostcardSize._6x9,
    mail_type: MailType.Standard,
    use_type: PscUseType.Marketing,
    front: postcardFrontHtml(sender),
    back: postcardBackHtml(sender, recipient),
    description: "Replacement Radar M7-3 TEST postcard",
  });

  return getLobPostcardsClient("test").create(postcard, idempotencyKey);
}
