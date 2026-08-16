const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((opt) =>
      opt
        .setName('style')
        .setDescription('Dropdown menu or buttons (defaults to config.json setting)')
        .setRequired(false)
        .addChoices({ name: 'Dropdown', value: 'dropdown' }, { name: 'Buttons', value: 'buttons' })
    ),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setDescription(config.panel.description)
      .setColor(config.panel.color || '#5865F2');
    if (config.panel.title) embed.setTitle(config.panel.title);

    const style = interaction.options.getString('style') || config.panel.style || 'dropdown';
    const components = [];

    if (style === 'buttons') {
      let row = new ActionRowBuilder();
      config.categories.forEach((cat, i) => {
        if (i > 0 && i % 5 === 0) {
          components.push(row);
          row = new ActionRowBuilder();
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_open_${cat.id}`)
            .setLabel(cat.label)
            .setEmoji(cat.emoji || undefined)
            .setStyle(ButtonStyle.Primary)
        );
      });
      components.push(row);
    } else {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category…')
        .addOptions(
          config.categories.map((cat) => ({
            label: cat.label,
            description: (cat.description || '').slice(0, 100),
            value: cat.id,
            emoji: cat.emoji || undefined,
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    await interaction.channel.send({ embeds: [embed], components });
    await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  },
};
