import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeft, X } from 'react-native-feather';
import type { Exercise } from '@/db';
import { useAppearance } from '@/components/appearance-provider';

export function ExerciseDetailSheet({ exercise, children, headingDetails, onDismiss, dismissIcon = 'back' }: { exercise: Exercise; children: ReactNode; headingDetails?: ReactNode; onDismiss?: () => void; dismissIcon?: 'back' | 'close' }) {
  const { colors } = useAppearance();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [backgroundPhoto, setBackgroundPhoto] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  return <View style={styles.body} onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}>
    {backgroundPhoto && <Image source={`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${backgroundPhoto}`} contentFit="cover" style={styles.imageBackdrop} accessible={false} />}
    <Animated.ScrollView style={[styles.body, styles.sheetScroll]} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}>
      <View style={styles.imageSpacer} />
      <View style={[styles.sheet, { backgroundColor: colors.background, minHeight: panelHeight }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
        <View style={styles.exerciseDetails}>
          <Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text>
          <View style={styles.exerciseMeta}>{[exercise.area.toLowerCase(), exercise.equipment].map((label, index) => <View key={index} style={[styles.detailPill, { backgroundColor: colors.surface }]}><Text style={[styles.detailPillText, { color: colors.mutedText }]}>{label}</Text></View>)}</View>
          {headingDetails}
        </View>
        {children}
      </View>
    </Animated.ScrollView>
    <Animated.View style={[styles.pinnedImage, { height: scrollY.interpolate({ inputRange: [0, 288], outputRange: [288, 0], extrapolate: 'clamp' }) }]}>
      <ExerciseImage key={exercise.id} exercise={exercise} onPhotoChange={setBackgroundPhoto} scrollY={scrollY} />
    </Animated.View>
    {onDismiss && <Pressable onPress={onDismiss} style={({ pressed }) => [styles.backAction, styles.pinnedBack, { backgroundColor: colors.background }, pressed && { opacity: .7 }]} accessibilityRole="button" accessibilityLabel={dismissIcon === 'close' ? 'Close exercise info' : 'Back'}>{dismissIcon === 'close' ? <X width={20} height={20} color={colors.text} strokeWidth={2.3} /> : <ArrowLeft width={20} height={20} color={colors.text} strokeWidth={2.3} />}</Pressable>}
  </View>;

}

function ExerciseImage({ exercise, onPhotoChange, scrollY }: { exercise: Exercise; onPhotoChange: (photo: string | null) => void; scrollY: Animated.Value }) {
  const { colors } = useAppearance();
  const { width } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(width);
  const pager = useRef<ScrollView>(null);
  const [position, setPosition] = useState(0);
  const currentPage = useRef(0);
  useEffect(() => { pager.current?.scrollTo({ x: currentPage.current * pageWidth, animated: false }); }, [pageWidth]);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  let images: string[] = [];
  try {
    const details = JSON.parse(exercise.detailsJson ?? '{}');
    if (Array.isArray(details.images)) images = details.images.filter((value: unknown): value is string => typeof value === 'string');
  } catch { /* Older exercises can have no image metadata. */ }
  const activePhoto = images[position] ?? null;
  useEffect(() => { onPhotoChange(activePhoto); }, [activePhoto, onPhotoChange]);
  return <View style={[styles.hero, { backgroundColor: '#E4E5E7' }]} onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}>
      {images.length ? <ScrollView ref={pager} horizontal pagingEnabled nestedScrollEnabled bounces={false} showsHorizontalScrollIndicator={false} style={styles.heroPager} scrollEventThrottle={16} onScroll={(event) => {
        const page = Math.max(0, Math.min(images.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
        currentPage.current = page;
        setPosition(page);
      }}>
        {images.map((photo, index) => <View key={photo} style={[styles.heroPage, { width: pageWidth }]}>
          {failedImage !== photo ? <Image source={`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${photo}`} recyclingKey={`${exercise.id}:${index}`} contentFit="cover" style={styles.heroImage} onError={() => setFailedImage(photo)} accessibilityLabel={`${exercise.name}, movement position ${index + 1}`} accessibilityIgnoresInvertColors /> : <Text style={[styles.heroFallback, { color: '#72776D' }]}>{exercise.mark}</Text>}
        </View>)}
      </ScrollView> : <Text style={[styles.heroFallback, { color: '#72776D' }]}>{exercise.mark}</Text>}
      <Svg width="100%" height={100} style={styles.imageFade} pointerEvents="none">
        <Defs><LinearGradient id="exercise-top-fade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.background} stopOpacity="1" /><Stop offset="1" stopColor={colors.background} stopOpacity="0" /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#exercise-top-fade)" />
      </Svg>
      {images.length > 1 && <Animated.View style={[styles.photoPicker, { backgroundColor: colors.background, transform: [{ translateY: scrollY.interpolate({ inputRange: [0, 288], outputRange: [0, -288], extrapolate: 'clamp' }) }] }]}>{images.map((_, index) => <Pressable key={index} hitSlop={10} onPress={() => pager.current?.scrollTo({ x: index * pageWidth, animated: true })} accessibilityRole="button" accessibilityState={{ selected: position === index }} accessibilityLabel={`Show movement position ${index + 1} of ${images.length}`} style={[styles.photoDot, { backgroundColor: position === index ? colors.accent : colors.subtleText }, position === index && styles.photoDotSelected]} />)}</Animated.View>}
    </View>;
}

const styles = StyleSheet.create({
  body: { flex: 1 }, imageBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 }, sheetScroll: { zIndex: 1 }, sheetContent: { paddingBottom: 0 }, imageSpacer: { height: 288 }, sheet: { paddingHorizontal: 20, paddingBottom: 100, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous' }, sheetHandle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 }, pinnedImage: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', zIndex: 2 }, pinnedBack: { position: 'absolute', top: 12, left: 20, zIndex: 3 }, imageFade: { position: 'absolute', top: 0, left: 0, right: 0 }, exerciseName: { fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -1 },
  hero: { height: 300, justifyContent: 'center', alignItems: 'center' }, heroPager: { width: '100%', height: '100%' }, heroPage: { height: 300, alignItems: 'center', justifyContent: 'center' }, heroImage: { width: '100%', height: '100%' }, heroFallback: { fontSize: 60, fontWeight: '900' },
  backAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  photoPicker: { position: 'absolute', bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16 }, photoDot: { width: 6, height: 6, borderRadius: 3 }, photoDotSelected: { width: 12 },
  exerciseDetails: { paddingTop: 16, paddingBottom: 24 }, exerciseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, detailPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 }, detailPillText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }, 
});
