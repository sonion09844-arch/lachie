const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Post a custom embed or plain-text message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Message body text').setRequired(true)
    )
    .addStringOption((opt) => opt.setName('title').setDescription('Title (optional)').setRequired(false))
    .addStringOption((opt) =>
      opt.setName('color').setDescription('Hex color for the side bar, e.g. #5865F2').setRequired(false)
    )
    .addStringOption((opt) => opt.setName('footer').setDescription('Footer text').setRequired(false))
    .addStringOption((opt) => opt.setName('image').setDescription('Image URL').setRequired(false))
    .addBooleanOption((opt) =>
      opt
        .setName('plain')
        .setDescription('Send as normal text instead of an embed (no side bar/box)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || '#5865F2';
    const footer = interaction.options.getString('footer');
    const image = interaction.options.getString('image');
    const plain = interaction.options.getBoolean('plain') || false;

    if (plain) {
      let content = title ? `**${title}**\n${description}` : description;
      if (footer) content += `\n\n${footer}`;
      await interaction.channel.send({ content });
      await interaction.reply({ content: 'Message posted.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder().setDescription(description).setColor(color).setTimestamp();
    if (title) embed.setTitle(title);
    if (footer) embed.setFooter({ text: footer });
    if (image) embed.setImage(image);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Embed posted.', ephemeral: true });
  },
};
