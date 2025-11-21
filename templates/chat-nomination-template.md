Hello! You're recieving this because you contributed to [<=beatmapset.artist> - <=beatmapset.title>](https://osu.ppy.sh/beatmapsets/<=beatmapset.id>), which has been nominated to be up for voting in the <=round.name> round of Project Loved. <? (data.metadata.gamemodes.length > 1) ? "Polls" : "A poll" ?> will open on <=poll.start>, giving the community a chance to vote on whether the set should enter the Loved category.

<? if (data.metadata.gamemodes.length > 1) {
    `The set is being nominated for <=metadata.gamemode_names>. If the polls receive enough "yes" votes (thresholds listed below), then the passing modes can be moved to loved. Even if the other modes don't pass, you don't need to delete any difficulties.

    <=metadata.thresholds>`
} else {
    `The set is being nominated for <=metadata.gamemode_names>. If the poll reaches <=metadata.thresholds> or more "yes" votes, then it can be moved to loved.`
} ?>

<?
    if (data.beatmapset.excluded.length > 0) {
        "The following difficulties will remain unranked regardless of voting results:\n<=beatmapset.excluded>"
    }
?>To make sure everyone is appropriately notified, please let a member of Project Loved know if there are any additional guest or collab mappers involved. I currently have <=metadata.creator_names> listed.

If you **do not** want your work to be included in voting, you may also notify a member of Project loved, and it will be removed. Thanks!
Learn more abut Project Loved here: https://osu.ppy.sh/wiki/Community/Project_Loved