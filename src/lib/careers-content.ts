/**
 * The Careers page wording, exactly as supplied by the client. It is the client's own marketing copy,
 * so like blog posts it stays in English and is not run through the translation table.
 */

export const CAREERS_EMAIL = "info@justreference.in";

export interface CareersSection {
  id: string;
  heading: string;
  paragraphs: string[];
  subheading?: { heading: string; paragraphs: string[] };
}

export const CAREERS_SECTIONS: CareersSection[] = [
  {
    id: "what-you-do",
    heading: "What You Do",
    paragraphs: [
      "Register at www.justreference.in and share your ideas with us. Students, homemakers, professionals, retired individuals, and others are welcome to collaborate with us on a full-time or part-time basis, at their convenience.",
      "Whether you wish to pursue an idea or establish your own business, we will endeavour to provide appropriate guidance and support.",
    ],
  },
  {
    id: "way-to-work",
    heading: "Way to Work",
    paragraphs: [
      "We aim to guide you towards professional opportunities, help you develop your business ideas, and gain valuable work experience through part-time or full-time engagements.",
      "Join us to explore new possibilities, enhance your skills, and take meaningful steps towards achieving your career goals.",
      "We also offer internship opportunities to help you gain practical experience and strengthen your professional profile. Apply today and take the next step towards your future.",
    ],
  },
  {
    id: "what-we-do",
    heading: "What We Do",
    paragraphs: [
      "JustReference.in supports individuals, entrepreneurs, and businesses in achieving sustainable growth and expanding their reach locally and globally. We provide guidance across business strategy, technology, marketing, finance, and human resource management.",
      "We help businesses explore new opportunities, improve operational efficiency, and strengthen their competitive position through strategic collaboration and outsourcing solutions.",
      "We also focus on developing leadership capabilities, enhancing professional skills, and providing strategic insights that help organisations improve performance, adapt to evolving challenges, and achieve their business objectives.",
    ],
  },
  {
    id: "why-justreference",
    heading: "Why Justreference?",
    paragraphs: [
      "A career at Justreference offers opportunities for professional development, continuous learning, and meaningful growth. We aim to provide challenging assignments, a supportive work environment, and opportunities for both part-time and full-time engagement.",
    ],
    subheading: {
      heading: "An Employer with a Difference",
      paragraphs: [
        "At Justreference, we believe in combining strong organisational values with progressive human resource practices. We recognise our people as our greatest asset and strive to foster an environment that encourages innovation, collaboration, and organisational growth.",
        "We aspire to offer more than just a job — we aim to create opportunities for a fulfilling career and a platform for long-term professional development. At Justreference, people are our greatest strength, and human capital is the foundation of our success.",
      ],
    },
  },
];

export const CAREERS_OPENINGS = {
  heading: "Current Openings",
  paragraphs: [
    "At Justreference, we believe our people are our greatest asset. We continually seek talented individuals with diverse skills and experience to strengthen our team and support our growth.",
    "We welcome applications from both freshers and experienced professionals. If you are passionate about learning, professional development, and contributing to organisational success, explore our current opportunities and submit your application for consideration.",
  ],
  listHeading: "List of Open Positions",
  positions: [
    "Freshers and Experienced Candidates — Full-Time / Part-Time",
    "Business Development Manager",
    "Assistant Manager — Marketing & Communications",
    "Consultant Trainee — IT Recruitment",
  ],
};

export const CAREERS_APPLY = {
  heading: "Applying to Justreference",
  paragraphs: [
    "If you are passionate about challenges and professional growth, we invite you to explore career opportunities at Justreference.",
    "Please submit a well-prepared, up-to-date résumé that highlights your qualifications, skills, and experience. Each application will be reviewed for its relevance to the position.",
    "Shortlisted candidates may be invited to participate in interviews, written assessments, or other evaluations as part of the selection process.",
  ],
  button: "Submit Your Résumé",
};
