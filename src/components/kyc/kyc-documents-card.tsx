import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KycDocumentRow, type KycDocumentView } from "@/components/kyc/kyc-document-row";
import { listDocumentsForOwner } from "@/server/repositories/kyc/kyc-repository";
import {
  DOCUMENT_LABELS,
  KYC_ACCEPTED_LABEL,
  allowedDocumentTypes,
} from "@/server/domain/kyc/rules";

const HINTS = {
  PAN_CARD: "A clear photo or scan of the card. The name and number must be readable.",
  GST_CERTIFICATE: "Your GST registration certificate, if you are registered.",
} as const;

/** The person's own KYC documents: one row per document they can submit, with its status. */
export async function KycDocumentsCard({
  ownerUserId,
  isVendor,
  title = "KYC documents",
}: {
  ownerUserId: string;
  isVendor: boolean;
  title?: string;
}) {
  const documents = await listDocumentsForOwner(ownerUserId);
  const byType = new Map(documents.map((d) => [d.type, d]));

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {KYC_ACCEPTED_LABEL}. Our team checks each one against the number you entered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allowedDocumentTypes({ isVendor }).map((type) => {
          const doc = byType.get(type);
          const view: KycDocumentView | null = doc
            ? {
                id: doc.id,
                status: doc.status,
                originalName: doc.originalName,
                rejectedReason: doc.rejectedReason,
              }
            : null;
          return (
            <KycDocumentRow
              key={type}
              type={type}
              label={DOCUMENT_LABELS[type]}
              hint={HINTS[type]}
              document={view}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
