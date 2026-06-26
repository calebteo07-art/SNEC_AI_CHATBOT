# EyeBot Dev Journal

Building EyeBot for SNEC, trying to get it ready for the IELA award (deadline 22 June). I write these at night when I should be sleeping.

---

## Mon, 8 June

Okay so today I basically lived inside the daily check-in screen, since it's the first thing everyone sees. I got the streak working and wrote a pile of backup questions so it never shows up blank. The cold starts drove me mad though, the app keeps falling asleep on the free tier. I made the tutor way faster too. Felt good.

## Tue, 9 June

Honestly I have to be real, I kind of wasted today. I saw a nice website and got obsessed with copying it, so I cloned a whole new project and rebuilt all our screens in it. Then deploy hell, I fought the server all evening. Lesson learnt, I shouldn't chase a pretty reference with no plan.

## Wed, 10 June

Today I undid yesterday and went clean and light instead. The thing I'm proud of, I ripped out all the live AI content and put in fixed stuff I checked myself. It was slow, ate our quota, gave different answers each time. For a teaching tool I just want it correct and the same every time. Felt good.

## Thu, 11 June

Yeah okay I couldn't help myself. I built this crazy animated version, an eye that follows your cursor, fancy wipes, the whole thing. I did it mostly because I could. It looks insane. But does a tired trainee at 11pm really want a glowing eye staring at them? Probably not. I'll likely undo most of it tomorrow.

## Fri, 12 June

Yep, called it. The dark version was too much, I knew it when I woke up. So I did the boring heavy job, moved the whole frontend to a newer framework and switched the live site over. Then I dragged the look back to light. Funny thing, I had to build the loud version to be sure the simple one was right.

**Looking back on week 1 (for peer review):** honestly week one was me learning the hard way. I burnt a whole day copying a website with no plan, then built a crazy dark version just because I could. Both got thrown out. The lesson, stop adding stuff for show. The best call I made was ripping out the live AI content for fixed stuff I actually checked.

## Mon, 15 June

Today everything clicked. For once I planned the design before touching code, and wow it helped. I locked each decision, light background, moving gradient, real eye photos, clean logo. Then I built it screen by screen. The login eye nearly finished me though, I shipped like fifteen versions past midnight. But it looks so good now. Proud of this one.

## Tue, 16 June

Content day. Slow and quiet but kind of satisfying. I sat down and wrote all the real teaching content by hand, over 150 patient cases plus a few hundred flashcards. My eyes were square by midnight. But this is the part that really teaches people. Then I added the game side, points, ranks, daily goals. This isn't Duolingo.

## Wed, 17 June

Two big things today. First, I moved all the AI onto a faster, cheaper model. Second one scared me, some parts could freeze the whole server, and we only run one process so one slow request locks everyone out. I fixed it. That kind of bug never shows in a demo. Then I redesigned the tutor again. I have a problem.

## Thu, 18 June

Big feature day. I rebuilt the cases screen around a real eye image with clickable parts, and when the dots finally lined up I actually grinned. Then the main thing, a guided practice station where the checklist ticks itself off as you go, then gives a score. This one actually helps people learn. And yeah, I redesigned the flashcards. Again.

## Fri, 19 June

Last working day before the deadline and I'm nervous, not gonna lie. I spent the morning making a short video to show off the app, stitching screen recordings, captions and music together. Seeing two weeks of work look like a real launch felt amazing. Then I polished the flashcards one more time, I know. But I'm proud of it. For real.

**Looking back on week 2 (for peer review):** week two felt completely different because I planned first. The day I locked the design before coding was my best day all fortnight. The thing I'm proudest of isn't even visible, it's the fix that stopped the server freezing for everyone. Funny how the work that protects people never shows in a demo. Also I really need to stop redesigning the flashcards.
