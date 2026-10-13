"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR code of an otpauth:// URI, drawn in the browser (the URI holds the secret, so no external QR service). White square with a quiet-zone margin so it scans on the dark theme; decorative, the text secret is the accessible alternative. */
export function TotpQr({ uri }: { uri: string }) {
  return (
    <div className="w-fit rounded-md bg-white p-3" aria-hidden="true" data-testid="totp-qr">
      <QRCodeSVG value={uri} size={168} level="M" bgColor="#ffffff" fgColor="#000000" />
    </div>
  );
}
