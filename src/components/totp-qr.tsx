"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * QR code of an otpauth:// URI, drawn in the browser (the URI holds the secret, so it is never sent to a QR service or
 * any other origin). The square is an intentional, theme-independent white with black modules: a QR code only scans
 * reliably at full black-on-white contrast, so it uses absolute colours (arbitrary Tailwind values, not theme tokens)
 * even on the dark theme. Decorative for assistive tech — the text secret below it is the accessible alternative.
 */
export function TotpQr({ uri }: { uri: string }) {
  return (
    <div className="w-fit rounded-md bg-[white] p-3" aria-hidden="true" data-testid="totp-qr">
      <QRCodeSVG value={uri} size={168} level="M" bgColor="white" fgColor="black" />
    </div>
  );
}
