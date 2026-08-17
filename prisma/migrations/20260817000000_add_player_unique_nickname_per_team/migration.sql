-- AddUniqueConstraint
CREATE UNIQUE INDEX "Player_teamId_nickname_key" ON "Player"("teamId", "nickname");
