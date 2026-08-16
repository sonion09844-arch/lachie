const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Post the applications panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const apps = config.applications || [];

    const embed = new EmbedBuilder()
      .setDescription('Select which application you want to fill out below.')
      .setColor('#5865F2');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('application_select')
      .setPlaceholder('Select an application…')
      .addOptions(
        apps.map((app) => ({
          label: app.label,
          description: (app.description || '').slice(0, 100),
          value: app.id,
          emoji: app.emoji || undefined,
        }))
      );

    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
    });
    await interaction.reply({ content: 'Application panel posted.', ephemeral: true });
  },
};
