export type HighlightColor = string;

export type AnnotationType = "highlight" | "note";

export type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StudyAnnotation = {
  id: string;
  documentId: string;
  page: number;
  text: string;
  type: AnnotationType;
  color: HighlightColor;
  note?: string;
  rects: HighlightRect[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TermNote = {
  id: string;
  documentId: string;
  term: string;
  normalized: string;
  definition: string;
  color: HighlightColor;
  review?: {
    attempts: number;
    correct: number;
    streak: number;
    lastReviewedAt?: string;
    nextReviewAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type StoredDocument = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  addedAt: string;
  lastOpenedAt?: string;
  favorite?: boolean;
  deletedAt?: string;
};

export type LibraryView = "all" | "recent" | "favorites" | "trash";

export type PdfDocumentRecord = StoredDocument & {
  data: ArrayBuffer;
};

export type ReadingProgress = {
  documentId: string;
  page: number;
  scrollTop: number;
  scrollRatio: number;
  updatedAt: string;
};

export type SelectionDraft = {
  text: string;
  page: number;
  rects: HighlightRect[];
  anchor: {
    x: number;
    y: number;
  };
};

export type StudyTab = "annotations" | "terms" | "review";
