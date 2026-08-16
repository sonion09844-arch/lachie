const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createTicket, claimTicket, closeTicket } = require('../utils/ticketManager');
const { startDmApplication } = require('../utils/dmApplication');
const config = require('../config.json');

function isApplicationStaff(member) {
  const roleIds = (config.applicationStaffRoleIds || []).filter((id) => id && !id.startsWith('PUT_'));
  return roleIds.some((id) => member.roles.cache.has(id));
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
        await createTicket(interaction, interaction.values[0]);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'application_select') {
        const appId = interaction.values[0];
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const started = await startDmApplication(interaction.guild, interaction.user, appId, appConfig);

        if (!started) {
          return interaction.reply({
            content: "❌ I couldn't DM you. Please enable direct messages from server members and try again.",
            ephemeral: true,
          });
        }

        return interaction.reply({ content: '📬 Check your DMs to fill out the application!', ephemeral: true });
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_open_')) {
          const categoryId = interaction.customId.replace('ticket_open_', '');
          await createTicket(interaction, categoryId);
          return;
        }

        if (interaction.customId === 'ticket_claim') {
          await claimTicket(interaction);
          return;
        }

        if (interaction.customId === 'ticket_close') {
          await closeTicket(interaction);
          return;
        }

        if (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_deny_')) {
          const isAccept = interaction.customId.startsWith('app_accept_');
          const prefix = isAccept ? 'app_accept_' : 'app_deny_';
          const [applicantId, appId] = interaction.customId.replace(prefix, '').split('_');

          if (!isApplicationStaff(interaction.member)) {
            return interaction.reply({ content: 'Only staff can accept or deny applications.', ephemeral: true });
          }

          const appConfig = (config.applications || []).find((a) => a.id === appId);
          const label = appConfig ? appConfig.label : 'Application';

          const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(isAccept ? '#57F287' : '#ED4245')
            .setFooter({ text: `${isAccept ? 'Accepted' : 'Denied'} by ${interaction.user.tag}` });

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`app_accept_${applicantId}_${appId}`)
              .setLabel('Accept')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`app_deny_${applicantId}_${appId}`)
              .setLabel('Deny')
              .setEmoji('❌')
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true)
          );

          await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

          const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
          if (applicant) {
            await applicant
              .send(
                isAccept
                  ? `🎉 Your **${label}** application in **${interaction.guild.name}** was accepted!`
                  : `Your **${label}** application in **${interaction.guild.name}** was denied.`
              )
              .catch(() => {});
          }
          return;
        }
      }
    } catch (err) {
      console.error('Error handling interaction:', err);
      const errMsg = { content: 'Something went wrong handling that action.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};
