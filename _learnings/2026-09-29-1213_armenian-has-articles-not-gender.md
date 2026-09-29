# Armenian has articles, but no gender

**Symptom:** the first Unit 2 draft (`u2-01-der-die-das`) said "Armenian has no articles", to explain why der/die/das is hard for Hayk. The independent content reviewer flagged it as false.

**Cause:** Claude generalised from "Armenian has no grammatical gender" to "no articles". The two are separate.

- Definite article: a suffix, -ը after a consonant and -ն after a vowel (գիրք, book -> գիրքը, the book).
- Indefinite article: մի before the noun (մի գիրք, a book).
- Gender: none. That is the real gap, not the idea of an article.

**Consequences:**

- The fixed lesson says Armenian has articles but no gender, so the new load is gender, not articles. Keep that framing in later units.
- Russian is the other way round: gender, but no articles. So the idea of "the" and "a" comes from Armenian (and English), and the idea of three genders comes from Russian (though the genders often differ).
- Comparisons with Russian or Armenian are where Claude is most likely to be confidently wrong. Get each one checked in the independent review before it goes live. This review also caught a wrong Armenian question mark earlier.
