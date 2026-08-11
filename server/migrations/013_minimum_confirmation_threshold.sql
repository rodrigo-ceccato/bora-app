-- Existing single-person Boras are brought up to the new product minimum.
-- The original check remains compatible with the preceding API during a
-- rolling deploy; the API enforces the new lower bound authoritatively.
update events set threshold = 2 where threshold < 2;
