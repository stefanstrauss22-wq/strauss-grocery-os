-- Cache of on-the-fly translations (English source → target language) so that
-- recipe text and ingredient/item names can be DISPLAYED in Afrikaans without
-- changing the stored English value (which the Sixty60 cart matches against).
-- Translated once via AI, then served from here — instant and free thereafter.
CREATE TABLE IF NOT EXISTS translations (
  source     TEXT NOT NULL,
  lang       TEXT NOT NULL,            -- target language, e.g. 'af'
  translated TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source, lang)
);
