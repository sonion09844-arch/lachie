const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const QUESTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes to answer each question

const activeDmApplications = new Set();

function keyFor(userId, appId) {
  return `${userId}:${appId}`;
}

function buildCancelRow(appId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dmapp_cancel_${appId}`)
      .setLabel('Cancel Application')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Sends the first message and starts the question loop in the background.
 * Returns true/false for whether the DM could be sent at all.
 */
async function startDmApplication(guild, user, appId, appConfig) {
  const key = keyFor(user.id, appId);
  if (activeDmApplications.has(key)) return true;

  const dm = await user.createDM().catch(() => null);
  if (!dm) return false;

  const intro = await dm
    .send(
      `📋 **${appConfig.label}**\n` +
        `I'll ask you ${appConfig.questions.length} question(s) one at a time — reply here with your answer, ` +
        `or press the Cancel button under any question to stop.`
    )
    .catch(() => null);

  if (!intro) return false;

  activeDmApplications.add(key);
  runQuestionLoop(guild, user, dm, appId, appConfig).finally(() => {
    activeDmApplications.delete(key);
  });

  return true;
}

/**
 * Sends one question with a Cancel button underneath it, then waits for
 * EITHER a text reply OR the Cancel button — whichever happens first.
 */
async function askQuestion(dm, user, appId, question, index, total) {
  const questionMsg = await dm
    .send({
      content: `**Question ${index + 1}/${total}:** ${question}`,
      components: [buildCancelRow(appId)],
    })
    .catch(() => null);

  if (!questionMsg) return { type: 'timeout' };

  const answerPromise = dm
    .awaitMessages({
      filter: (m) => m.author.id === user.id,
      max: 1,
      time: QUESTION_TIMEOUT_MS,
      errors: ['time'],
    })
    .then((collected) => ({ type: 'answer', value: collected.first().content.trim() }))
    .catch(() => ({ type: 'timeout' }));

  const cancelPromise = questionMsg
    .awaitMessageComponent({
      filter: (i) => i.user.id === user.id && i.customId === `dmapp_cancel_${appId}`,
      time: QUESTION_TIMEOUT_MS,
    })
    .then((buttonInteraction) => ({ type: 'cancel', interaction: buttonInteraction }))
    .catch(() => ({ type: 'timeout' }));

  const result = await Promise.race([answerPromise, cancelPromise]);

  // Whatever happened, the button on this question shouldn't stay clickable.
  await questionMsg.edit({ components: [] }).catch(() => {});

  return result;
}

async function runQuestionLoop(guild, user, dm, appId, appConfig) {
  const answers = [];

  for (let i = 0; i < appConfig.questions.length; i++) {
    const result = await askQuestion(dm, user, appId, appConfig.questions[i], i, appConfig.questions.length);

    if (result.type === 'timeout') {
      await dm.send('⏱️ You took too long to respond — your application has been cancelled.').catch(() => {});
      return;
    }

    if (result.type === 'cancel') {
      await result.interaction
        .update({ content: '❌ Application cancelled. You can start again from the panel anytime.', components: [] })
        .catch(() => {});
      return;
    }

    answers.push(result.value || 'No answer');
  }

  await dm.send('✅ Application submitted! Staff will review it and get back to you.').catch(() => {});
  await postForReview(guild, user, appId, appConfig, answers);
}

async function postForReview(guild, user, appId, appConfig, answers) {
  const reviewChannelId = config.applicationReviewChannelId;
  if (!reviewChannelId || reviewChannelId.startsWith('PUT_')) {
    console.warn('applicationReviewChannelId is not set in config.json — application was not posted anywhere.');
    return;
  }

  const reviewChannel = await guild.channels.fetch(reviewChannelId).catch(() => null);
  if (!reviewChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application: ${appConfig.label}`)
    .setColor(appConfig.color || '#5865F2')
    .setThumbnail(user.displayAvatarURL())
    .addFields({ name: 'Applicant', value: `<@${user.id}> (${user.tag})` })
    .setFooter({ text: `User ID: ${user.id}` })
    .setTimestamp();

  appConfig.questions.forEach((q, i) => {
    embed.addFields({ name: q, value: answers[i] || 'No answer' });
  });

  const decisionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${user.id}_${appId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`app_deny_${user.id}_${appId}`)
      .setLabel('Deny')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  const mentions = (config.applicationStaffRoleIds || [])
    .filter((id) => id && !id.startsWith('PUT_'))
    .map((id) => `<@&${id}>`)
    .join(' ');

  await reviewChannel.send({ content: mentions || undefined, embeds: [embed], components: [decisionRow] });
}

module.exports = { startDmApplication };
