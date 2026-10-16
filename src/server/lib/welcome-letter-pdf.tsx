import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

/**
 * The member welcome letter, worded exactly as the client supplied it (Member Welcome Letter -
 * Revised). Only the member's details and the support address are filled in; the support address
 * comes from the admin-managed contact settings, never from the code.
 */

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  heading: { fontSize: 12, letterSpacing: 1, color: "#555", marginBottom: 24 },
  paragraph: { marginBottom: 10 },
  name: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  details: { marginBottom: 14, color: "#222" },
  subject: { fontFamily: "Helvetica-Bold", marginBottom: 12 },
  sign: { marginTop: 14 },
  bold: { fontFamily: "Helvetica-Bold" },
});

export interface WelcomeLetterData {
  /** When the member joined: the date and time printed at the top of the letter. */
  issuedAt: Date;
  memberName: string;
  membershipNumber: string;
  /** The Member ID of whoever referred this member; left out of the letter when nobody did. */
  referralId: string | null;
  email: string;
  mobile: string | null;
  supportEmail: string | null;
}

/** "16 Oct 2026, 11:42 am" in Indian time, whatever time zone the server runs in. */
export function formatLetterDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(" at ", ", ");
}

function WelcomeLetter({ data }: { data: WelcomeLetterData }) {
  const support = data.supportEmail
    ? `please contact our Support Team at ${data.supportEmail}`
    : "please contact our Support Team";
  return (
    <Document title="Welcome to Justreference.in">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>Justreference</Text>
        <Text style={styles.heading}>MEMBER WELCOME LETTER</Text>

        <Text style={styles.paragraph}>Date &amp; Time: {formatLetterDateTime(data.issuedAt)}</Text>

        <Text style={styles.paragraph}>Dear Member,</Text>
        <Text style={styles.name}>{data.memberName.toUpperCase()}</Text>
        <View style={styles.details}>
          <Text>
            Membership No.: {data.membershipNumber}
            {data.referralId ? ` | Referral ID No.: ${data.referralId}` : ""}
          </Text>
          <Text>Email: {data.email}</Text>
          {data.mobile ? <Text>Mobile No.: {data.mobile}</Text> : null}
        </View>

        <Text style={styles.subject}>Subject: Welcome to Justreference.in</Text>

        <Text style={styles.paragraph}>
          Thank you for placing your confidence in Justreference.in and for choosing our services to
          meet your membership requirements. We sincerely appreciate the trust you have placed in us
          and are committed to earning your continued confidence through professional, responsive,
          and reliable service.
        </Text>
        <Text style={styles.paragraph}>
          We are confident that your association with Justreference.in will be both convenient and
          rewarding. Our knowledgeable and courteous team remains committed to assisting you and to
          ensuring that the services extended to you consistently meet the standards you expect.
        </Text>
        <Text style={styles.paragraph}>
          For your convenience, the principal features and services available to you are accessible
          through your Member Login Panel. Should you require any clarification or assistance,{" "}
          {support}, quoting your membership number in all correspondence. For expedited assistance
          by telephone, please keep your membership or account details readily available.
        </Text>
        <Text style={styles.paragraph}>
          As your requirements evolve, we look forward to continuing to serve you. We shall make
          every reasonable effort to understand your individual requirements and circumstances and,
          where appropriate, recommend solutions that are suited to your needs.
        </Text>
        <Text style={styles.paragraph}>
          Once again, we thank you for choosing Justreference.in and for the confidence you have
          placed in our organisation. We value your association and look forward to serving you for
          many years to come.
        </Text>

        <Text style={styles.sign}>Yours sincerely,</Text>
        <Text style={styles.bold}>Justreference Team</Text>
        {data.supportEmail ? <Text>Customer Support: {data.supportEmail}</Text> : null}
      </Page>
    </Document>
  );
}

export function renderWelcomeLetter(data: WelcomeLetterData): Promise<Buffer> {
  return renderToBuffer(<WelcomeLetter data={data} />);
}
