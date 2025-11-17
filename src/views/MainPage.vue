<template>
  <div>
    <div class="info">
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent>
          <h3 style="font-weight: bold;">Content Title</h3>
          <p>Content</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default {
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  },
  created() {
    this.fetchData();
  },
  mounted() {
  },
  unmounted() {
  },
  data: function() {
    return {
    };
  },
  methods: {
    fetchData() {
    },
  },
  computed: {},
};
</script>

<style scoped>
.info {
  -webkit-column-count: 4;
  -moz-column-count: 4;
  column-count: 4;
}

.info > div {
  break-inside: avoid;
}

.info > div:not(:first-child) {
  margin-top: 1em;
}

@media (max-width: 2100px) {
  .info {
    -moz-column-count: 4;
    -webkit-column-count: 4;
    column-count: 4;
  }
}
@media (max-width: 1200px) {
  .info {
    -moz-column-count: 3;
    -webkit-column-count: 3;
    column-count: 3;
  }
}
@media (max-width: 600px) {
  .info {
    -moz-column-count: 2;
    -webkit-column-count: 2;
    column-count: 2;
  }
}
</style>
