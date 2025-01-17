import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Text,
  Heading,
  useToast,
  Card,
  CardBody,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  Progress,
  Badge,
  SimpleGrid,
  Flex,
  Tooltip,
} from '@chakra-ui/react';
import { parseChannelIds, queryMessageStats } from '../../services/engagement';
import { getDiscordChannelConfig } from '../../services/admin/metasync';
import { DiscordServer, StatsResponseRecord } from '../../types';
import { devPrint, resolveName } from '../../components/utils/RandomUtils';
import { MultiSelect, Option } from 'chakra-multiselect';
import { useMembers } from '../../hooks/useMembers';
import { ChannelSelector } from '../../components/admin/ChannelSelector';
import { RefreshCcw } from 'lucide-react';

function parseSelectedOptions(selections: Option | Option[]): number[] {
  if (Array.isArray(selections)) {
    return selections.map((v, idx) => parseInt(v.value as string));
  }

  return [parseInt(selections.value as string)];
}

function ChannelStats({
  channelId,
  channel,
  count,
  progress,
  isSelected,
  onToggle,
}: {
  channelId: string;
  channel: string;
  count: number;
  progress: number;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Box
      cursor="pointer"
      onClick={() => onToggle(channelId)}
      bg={isSelected ? 'whiteAlpha.200' : 'transparent'}
      _hover={{ bg: 'whiteAlpha.100' }}
      borderRadius="md"
      p={2}
      transition="all 0.2s"
    >
      {channel === 'total' ? (
        <Text fontWeight="bold">Total Messages</Text>
      ) : (
        <Tooltip
          label={
            isSelected
              ? 'Click to remove from selection'
              : 'Click to add to selection'
          }
        >
          <Flex justify="space-between" mb={1}>
            <Text fontWeight="medium">{channel}</Text>
            <Badge colorScheme={isSelected ? 'green' : 'blue'}>{count}</Badge>
          </Flex>
        </Tooltip>
      )}
      <Progress
        value={progress}
        colorScheme={isSelected ? 'green' : 'blue'}
        borderRadius="full"
      />
    </Box>
  );
}

function MemberStats({
  member,
  total,
  progress,
  isSelected,
  onToggle,
}: {
  member: StatsResponseRecord['member'];
  total: number;
  progress: number;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Box
      cursor="pointer"
      bg={isSelected ? 'whiteAlpha.200' : 'transparent'}
      _hover={{ bg: 'whiteAlpha.100' }}
      onClick={() => onToggle('' + member.id)}
      borderRadius="md"
      p={2}
      transition="all 0.2s"
    >
      <Tooltip
        label={
          isSelected
            ? 'Click to remove from selection'
            : 'Click to add to selection'
        }
      >
        <Flex justify="space-between" mb={1}>
          <Text fontWeight="medium">{resolveName(member)}</Text>
          <Badge colorScheme={isSelected ? 'green' : 'blue'}>{total}</Badge>
        </Flex>
      </Tooltip>
      <Progress
        value={progress}
        colorScheme={isSelected ? 'green' : 'blue'}
        borderRadius="full"
      />
    </Box>
  );
}

export default function DiscordMessageEngagementDashboardPage() {
  const [channelIdsInput, setChannelIdsInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<StatsResponseRecord[]>([]);
  const [refreshConfigSignal, setRefreshConfigSignal] = useState(0);
  const toast = useToast();

  const { options, isLoading: areMembersLoading } = useMembers();
  const [selectedMembers, setSelectedMembers] = useState<Option | Option[]>([]);

  const discordServerRef = useRef<DiscordServer | null>(null);

  const selectedChannelIds = useMemo(
    () => new Set(channelIdsInput.split(',').filter(Boolean)),
    [channelIdsInput]
  );

  const selectedMemberIds = useMemo(
    () => new Set(parseSelectedOptions(selectedMembers).map(toString)),
    [selectedMembers]
  );

  useEffect(() => {
    getDiscordChannelConfig().then((server) => {
      discordServerRef.current = server;
      devPrint(discordServerRef.current);
    });
  }, [refreshConfigSignal]);

  const handleToggleChannel = (channelId: string) => {
    if (channelId === 'total') return;
    const currentChannels = new Set(selectedChannelIds);
    if (currentChannels.has(channelId)) {
      currentChannels.delete(channelId);
    } else {
      currentChannels.add(channelId);
    }
    setChannelIdsInput(Array.from(currentChannels).join(','));
  };

  const handleToggleMember = (memberId: string) => {
    const currentSelected = Array.isArray(selectedMembers)
      ? selectedMembers
      : selectedMembers
      ? [selectedMembers]
      : [];

    const memberIndex = currentSelected.findIndex((m) => m.value === memberId);

    let newSelectedMembers = currentSelected;
    if (memberIndex >= 0) {
      newSelectedMembers = [
        ...currentSelected.slice(0, memberIndex),
        ...currentSelected.slice(memberIndex + 1),
      ];
    } else {
      const memberOption = options.find((opt) => opt.value === memberId);
      if (memberOption) {
        newSelectedMembers = [...currentSelected, memberOption];
      }
    }

    setSelectedMembers(newSelectedMembers);
  };
  const aggregatedStats = useMemo(() => {
    if (!stats.length) return null;

    const channelTotals = stats.reduce((acc, record) => {
      Object.entries(record.stats).forEach(([channel, count]) => {
        acc[channel] = (acc[channel] || 0) + count;
      });
      return acc;
    }, {} as Record<string, number>);

    const totalMessages = Object.values(channelTotals).reduce(
      (sum, count) => sum + count,
      0
    );

    const memberTotals = stats.map((record) => ({
      member: record.member,
      total: Object.entries(record.stats).reduce(
        (sum, [, count]) => sum + count,
        0
      ),
    }));

    return {
      totalMessages,
      channelTotals,
      memberTotals,
      maxChannelMessages: Math.max(...Object.values(channelTotals)),
    };
  }, [stats]);

  const handleQuery = async () => {
    setLoading(true);
    try {
      const memberQuery = parseSelectedOptions(selectedMembers);
      const channelIds = parseChannelIds(channelIdsInput);
      const stats = await queryMessageStats(memberQuery, channelIds);
      setStats(stats);
    } catch (e) {
      toast({
        title: 'Failed to query message stats',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={6} maxW="1200px" mx="auto">
      <Card mb={6} variant="filled" bg="whiteAlpha.50">
        <CardBody>
          <Stack spacing={6}>
            <Heading size="lg">Discord Message Metrics</Heading>

            <Flex
              w="100%"
              gap={4}
              flexDir={{ md: 'row', sm: 'column', lg: 'row', base: 'column' }}
              alignItems="flex-start"
            >
              <Box w="50%">
                <Text mb={2} fontWeight="medium">
                  Members
                </Text>
                {!areMembersLoading && (
                  <MultiSelect
                    value={selectedMembers}
                    onChange={setSelectedMembers}
                    options={options}
                    label="Select members, or enter a member ID"
                  ></MultiSelect>
                )}
              </Box>
              <Box>
                <Text
                  mb={2}
                  fontWeight="medium"
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  Channels
                  <Button
                    size="sm"
                    onClick={() => setRefreshConfigSignal((s) => s + 1)}
                  >
                    <RefreshCcw size={16} />
                  </Button>
                </Text>
                <ChannelSelector
                  server={discordServerRef.current}
                  value={channelIdsInput}
                  onChange={setChannelIdsInput}
                />
              </Box>
            </Flex>

            <Button
              onClick={handleQuery}
              isLoading={loading}
              colorScheme="blue"
              size="lg"
            >
              Generate Report
            </Button>
          </Stack>
        </CardBody>
      </Card>

      {aggregatedStats && (
        <Stack spacing={6}>
          <Card variant="filled" bg="whiteAlpha.50">
            <CardBody>
              <StatGroup>
                <Stat>
                  <StatLabel>Total Messages</StatLabel>
                  <StatNumber>{aggregatedStats.totalMessages}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel>Active Members</StatLabel>
                  <StatNumber>{stats.length}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel>Active Channels</StatLabel>
                  <StatNumber>
                    {Object.keys(aggregatedStats.channelTotals).length}
                  </StatNumber>
                </Stat>
              </StatGroup>
            </CardBody>
          </Card>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
            <Card variant="filled" bg="whiteAlpha.50">
              <CardBody>
                <Heading size="md" mb={4}>
                  Channel Activity
                </Heading>
                <Stack spacing={4}>
                  {Object.entries(aggregatedStats.channelTotals)
                    .sort(([, a], [, b]) => b - a)
                    .map(([channel, count]) => (
                      <ChannelStats
                        key={channel}
                        channelId={channel}
                        channel={
                          discordServerRef.current?.getChannel(Number(channel))
                            ?.name || channel
                        }
                        count={count}
                        progress={
                          (count / aggregatedStats.maxChannelMessages) * 100
                        }
                        isSelected={selectedChannelIds.has(channel)}
                        onToggle={handleToggleChannel}
                      />
                    ))}
                </Stack>
              </CardBody>
            </Card>

            <Card variant="filled" bg="whiteAlpha.50">
              <CardBody>
                <Heading size="md" mb={4}>
                  Member Activity
                </Heading>
                <Stack spacing={4}>
                  {aggregatedStats.memberTotals
                    .sort((a, b) => b.total - a.total)
                    .map(({ member, total }) => (
                      <MemberStats
                        key={member.id}
                        member={member}
                        total={total}
                        progress={(total / aggregatedStats.totalMessages) * 100}
                        isSelected={selectedMemberIds.has('' + member.id)}
                        onToggle={handleToggleMember}
                      />
                    ))}
                </Stack>
              </CardBody>
            </Card>
          </SimpleGrid>
        </Stack>
      )}
    </Box>
  );
}
